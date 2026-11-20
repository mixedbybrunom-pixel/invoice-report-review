import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDriverDays, buildReviewGroups, parseDeliveryDate, singleDayFromRange, summariseByDriver, summariseDay, normaliseVehicle } from '@/lib/drivers';

const row = (extra: Record<string, unknown>) => ({
  Driver: 'HR-1', 'Driver Name': 'Joe', Vehicle: 'LR06KTGP', 'Delivery Date': '19-11-2026', 'Document ID': 'MAT-1', 'Invoice No': '5600001', Weight: 10, ...extra,
});

test('dates are read the South African way and as ISO', () => {
  assert.equal(parseDeliveryDate('19-11-2026'), '2026-11-19');
  assert.equal(parseDeliveryDate('2026-11-19'), '2026-11-19');
  assert.equal(parseDeliveryDate('05/11/2026'), '2026-11-05');
  assert.equal(parseDeliveryDate(46345), '2026-11-19');
  assert.equal(parseDeliveryDate('31-02-2026'), null);
  assert.equal(parseDeliveryDate('nonsense'), null);
  assert.equal(singleDayFromRange('2026-11-19 to 2026-11-19'), '2026-11-19');
  assert.equal(singleDayFromRange('2026-11-19 to 2026-11-20'), null);
});

test('vehicle registrations are tidied', () => {
  assert.equal(normaliseVehicle(' lr06 ktgp '), 'LR06KTGP');
});

test('rows become one entry per driver, vehicle and day', () => {
  const { days, skipped } = buildDriverDays([
    row({ 'Invoice No': '1' }), row({ 'Invoice No': '2', 'Document ID': 'MAT-2' }), row({ 'Invoice No': '2' }),
    row({ Driver: 'HR-2', 'Driver Name': 'Sam', Vehicle: 'NB42TFGP', 'Invoice No': '3' }),
    row({ 'Driver Name': '', Driver: '' }),
  ] as never);
  assert.equal(skipped, 1);
  assert.equal(days.length, 2);
  const joe = days.find((d) => d.driverName === 'Joe')!;
  assert.equal(joe.invoiceCount, 2); // invoice 2 appears twice but counts once
  assert.equal(joe.tripCount, 2);
  assert.equal(joe.weight, 30);
  assert.deepEqual(summariseDay(days), { drivers: 2, vehicles: 2 });
});

test('a report with no date column uses the header date', () => {
  const { days } = buildDriverDays([row({ 'Delivery Date': undefined })] as never, '2026-11-19');
  assert.equal(days[0].date, '2026-11-19');
});

test('a driver in two vehicles is flagged', () => {
  const { days } = buildDriverDays([row({}), row({ Vehicle: 'NB42TFGP' })] as never);
  const groups = buildReviewGroups(days);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, 'multi_vehicle');
  assert.match(groups[0].title, /Joe used LR06KTGP and NB42TFGP/);
});

test('a vehicle with two drivers is flagged', () => {
  const { days } = buildDriverDays([row({}), row({ Driver: 'HR-2', 'Driver Name': 'Sam' })] as never);
  const groups = buildReviewGroups(days);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, 'shared_vehicle');
  assert.match(groups[0].title, /Joe and Sam both used LR06KTGP/);
});

test('a driver with no vehicle is flagged but not stored under a blank vehicle', () => {
  const { days } = buildDriverDays([row({ Vehicle: '' })] as never);
  assert.equal(buildReviewGroups(days)[0].kind, 'no_vehicle');
});

test('the same driver and vehicle on different days is fine', () => {
  const { days } = buildDriverDays([row({}), row({ 'Delivery Date': '20-11-2026' })] as never);
  assert.equal(buildReviewGroups(days).length, 0);
});

test('history shows which vehicles a driver used and on how many days', () => {
  const { days } = buildDriverDays([
    row({ 'Delivery Date': '17-11-2026' }), row({ 'Delivery Date': '18-11-2026' }), row({ 'Delivery Date': '19-11-2026', Vehicle: 'NB42TFGP' }),
  ] as never);
  const [joe] = summariseByDriver(days);
  assert.equal(joe.days, 3);
  assert.deepEqual(joe.vehicles.map((v) => [v.vehicle, v.days]), [['LR06KTGP', 2], ['NB42TFGP', 1]]);
  assert.equal(joe.vehicles[0].first, '2026-11-17');
  assert.equal(joe.vehicles[0].last, '2026-11-18');
});
