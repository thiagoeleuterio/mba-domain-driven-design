import { MikroORM, MySqlDriver } from '@mikro-orm/mysql';
import {
  WaitingListSchema,
  WaitingListEntrySchema,
  EventSchema,
  EventSectionSchema,
  EventSpotSchema,
  CustomerSchema,
  PartnerSchema,
} from '../../schemas';
import { WaitingList, WaitingListId } from '../../../../domain/entities/waiting-list.entity';
import { WaitingListMysqlRepository } from '../waiting-list-mysql.repository';
import { Event } from '../../../../domain/entities/event.entity';
import { EventMysqlRepository } from '../event-mysql.repository';
import { Customer } from '../../../../domain/entities/customer.entity';
import { CustomerMysqlRepository } from '../customer-mysql.repository';
import { Partner } from '../../../../domain/entities/partner.entity';
import { PartnerMysqlRepository } from '../partner-mysql.repository';

test('WaitingList repository - persist entries with MyCollection', async () => {
  const orm = await MikroORM.init<MySqlDriver>({
    entities: [
      WaitingListSchema,
      WaitingListEntrySchema,
      EventSchema,
      EventSectionSchema,
      EventSpotSchema,
      CustomerSchema,
      PartnerSchema,
    ],
    dbName: 'events',
    host: 'localhost',
    port: 3307,
    user: 'root',
    password: 'root',
    type: 'mysql',
    forceEntityConstructor: true,
    debug: false,
  });
  await orm.schema.refreshDatabase();
  const em = orm.em.fork();
  const waitingListRepo = new WaitingListMysqlRepository(em);
  const eventRepo = new EventMysqlRepository(em);
  const customerRepo = new CustomerMysqlRepository(em);
  const partnerRepo = new PartnerMysqlRepository(em);

  // Setup: create partner
  const partner = Partner.create({ name: 'Test Partner' });
  await partnerRepo.add(partner);

  // Setup: create event with section
  const event = partner.initEvent({
    name: 'Test Event',
    date: new Date(),
    description: 'Test Event description',
  });
  event.addSection({
    name: 'Test Section',
    description: 'Test Section description',
    price: 100,
    total_spots: 10,
  });
  await eventRepo.add(event);

  // Setup: create customers
  const customer1 = Customer.create({
    name: 'Customer 1',
    cpf: '703.758.870-91',
  });
  const customer2 = Customer.create({
    name: 'Customer 2',
    cpf: '111.222.333-44',
  });
  await customerRepo.add(customer1);
  await customerRepo.add(customer2);
  await em.flush();
  await em.clear();

  // Test: create waiting list and add entries
  const section = event.sections.values()[0];
  const waitingList = WaitingList.create({
    event_id: event.id,
    section_id: section.id,
  });

  waitingList.addEntry(customer1.id);
  waitingList.addEntry(customer2.id);

  await waitingListRepo.add(waitingList);
  await em.flush(); // This should NOT fail with "Cannot set property entries of WaitingList which has only a getter"
  await em.clear();

  // Verify: find waiting list and check entries were persisted
  let waitingListFound = await waitingListRepo.findByEventAndSection(
    event.id,
    section.id,
  );
  expect(waitingListFound).toBeDefined();
  expect(waitingListFound.id.equals(waitingList.id)).toBeTruthy();
  expect(waitingListFound.entries.count()).toBe(2);

  const entries = waitingListFound.entries.values();
  expect(entries[0].customer_id.equals(customer1.id)).toBeTruthy();
  expect(entries[1].customer_id.equals(customer2.id)).toBeTruthy();

  // Test: offer spot to next customer
  const availableSpot = section.spots.values()[0];
  const offeredEvent = waitingListFound.offerSpotToNext(availableSpot.id);
  expect(offeredEvent).toBeDefined();
  expect(offeredEvent.customer_id.equals(customer1.id)).toBeTruthy();

  await waitingListRepo.add(waitingListFound);
  await em.flush();
  await em.clear();

  // Verify: entry status changed
  waitingListFound = await waitingListRepo.findByEventAndSection(
    event.id,
    section.id,
  );
  const allEntries = waitingListFound.entries.values();
  expect(allEntries[0].status).toBe('OFFERED');
  expect(allEntries[1].status).toBe('PENDING');

  await orm.close();
});
