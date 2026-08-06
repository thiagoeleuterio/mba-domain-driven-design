import { AggregateRoot } from '../../../common/domain/aggregate-root';
import Uuid from '../../../common/domain/value-objects/uuid.vo';
import { CustomerId } from './customer.entity';
import { EventId } from './event.entity';
import { EventSectionId } from './event-section';
import { EventSpotId } from './event-spot';
import {
  WaitingListEntry,
  WaitingListEntryId,
  WaitingListEntryStatus,
  WaitingListEntryConstructorProps,
} from './waiting-list-entry.entity';
import { SpotOfferedToWaitingCustomer } from '../events/domain-events/spot-offered-to-waiting-customer.event';
import { CustomerJoinedWaitingList } from '../events/domain-events/customer-joined-waiting-list.event';
import {
  AnyCollection,
  ICollection,
  MyCollectionFactory,
} from '../../../common/domain/my-collection';

export class WaitingListId extends Uuid {}

export type WaitingListConstructorProps = {
  id?: WaitingListId | string;
  event_id: EventId;
  section_id: EventSectionId;
  entries?: WaitingListEntry[];
};

export class WaitingList extends AggregateRoot {
  id: WaitingListId;
  event_id: EventId;
  section_id: EventSectionId;
  private _entries: ICollection<WaitingListEntry>;

  constructor(props: WaitingListConstructorProps) {
    super();
    this.id =
      typeof props.id === 'string'
        ? new WaitingListId(props.id)
        : props.id ?? new WaitingListId();
    this.event_id =
      props.event_id instanceof EventId
        ? props.event_id
        : new EventId(props.event_id);
    this.section_id =
      props.section_id instanceof EventSectionId
        ? props.section_id
        : new EventSectionId(props.section_id);
    this._entries = MyCollectionFactory.create<WaitingListEntry>(this);
    if (props.entries) {
      props.entries.forEach((entry) => this._entries.add(entry));
    }
  }

  static create(props: WaitingListConstructorProps) {
    const wl = new WaitingList(props);
    return wl;
  }

  addEntry(customer_id: CustomerId) {
    const hasPending = this._entries.find(
      (e) =>
        e.customer_id.equals(customer_id) &&
        e.status === WaitingListEntryStatus.PENDING,
    );
    if (hasPending) {
      throw new Error('Customer already in waiting list');
    }
    const entry = WaitingListEntry.create({ customer_id });
    this._entries.add(entry);
    this.addEvent(
      new CustomerJoinedWaitingList(
        this.id,
        customer_id,
        this.event_id,
        this.section_id,
      ),
    );
  }

  offerSpotToNext(spot_id: EventSpotId): SpotOfferedToWaitingCustomer | null {
    const pendingEntry = this._entries.find(
      (e) => e.status === WaitingListEntryStatus.PENDING,
    );
    if (!pendingEntry) {
      return null;
    }
    pendingEntry.notify();
    const event = new SpotOfferedToWaitingCustomer(
      this.id,
      pendingEntry.customer_id,
      this.event_id,
      this.section_id,
      spot_id,
    );
    this.addEvent(event);
    return event;
  }

  get entries(): ICollection<WaitingListEntry> {
    return this._entries;
  }

  set entries(entries: AnyCollection<WaitingListEntry>) {
    this._entries = MyCollectionFactory.createFrom<WaitingListEntry>(entries);
  }

  toJSON() {
    return {
      id: this.id.value,
      event_id: this.event_id.value,
      section_id: this.section_id.value,
      entries: this._entries.map((e) => e.toJSON()),
    };
  }
}
