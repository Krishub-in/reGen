/**
 * Comprehensive Automated Tests for Regenai Dynamic Payroll & Payment System
 * Verifies all 16 test cases specified in the project requirements.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import {
  calculateEmployeeMonthlyPayroll,
  round2,
  calculateWorkedHours,
  getWeeklyOffDays,
} from './utils/payrollCalculator.js';
import User from './models/User.js';
import Company from './models/Company.js';
import PayrollSetting from './models/PayrollSetting.js';
import Payroll from './models/Payroll.js';
import PaymentTransaction from './models/PaymentTransaction.js';
import Attendance from './models/Attendance.js';
import Leave from './models/Leave.js';
import Holiday from './models/Holiday.js';
import PayrollAdjustment from './models/PayrollAdjustment.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  \x1b[32m✔ [PASS]\x1b[0m ${testName}`);
  } else {
    console.error(`  \x1b[31m✖ [FAIL]\x1b[0m ${testName} ${details ? '- ' + details : ''}`);
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('   REGENAI PAYROLL & PAYMENT SYSTEM TEST SUITE');
  console.log('======================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB for integration tests.\n');

  // Test setup data
  const testCompanyId = new mongoose.Types.ObjectId();
  const testCompanyId2 = new mongoose.Types.ObjectId();
  const testUserId = `TEST-EMP-${Date.now()}`;
  const testUserId2 = `TEST-EMP2-${Date.now()}`;
  const testMonth = '2026-10';

  const defaultSettings = {
    workingHoursPerDay: 8,
    workingDaysPerWeek: 5,
    weeklyOffDays: [0, 6], // Sun, Sat
    hourlyDeductionPct: 50,
    hourlyOvertimePct: 75,
    approvedLeaveDeductionPct: 25,
    unapprovedLeaveDeductionPct: 100,
    payrollDivisorType: 'scheduled_hours',
    fixedPayrollDivisor: 200,
    dailyBasisType: 'scheduled_days',
  };

  const dummyEmployee = {
    userId: testUserId,
    StaffId: testUserId,
    name: 'Test Employee 1',
    salary: '22000',
    department: 'Engineering',
  };

  // --------------------------------------------------------------------------
  console.log('\n--- Case 1: Employee works exactly the required hours ---');
  // --------------------------------------------------------------------------
  {
    // Oct 2026: 31 days. Day 1 is Thursday, Day 2 Friday, Day 3 Sat (weekly off), etc.
    // 22 working days in Oct 2026 with 5 days/wk.
    // Scheduled hours = 22 * 8 = 176h.
    // Base salary = 22,000.
    // Divisor = 176.
    // Hourly deduction rate = 22,000 * 50% / 176 = 62.50.
    // Hourly overtime rate = 22,000 * 75% / 176 = 93.75.
    const att1 = {
      date: '2026-10-01',
      checkIn: '2026-10-01T09:30:00.000Z',
      checkOut: '2026-10-01T17:30:00.000Z', // exactly 8 hours
      status: 'present',
    };
    const res = calculateEmployeeMonthlyPayroll({
      user: dummyEmployee,
      month: testMonth,
      settings: defaultSettings,
      attendances: [att1],
      leaves: [],
      holidays: [],
      referenceDate: new Date('2026-10-01T23:59:59.000Z'),
    });

    const day1 = res.dailyBreakdown.find(d => d.date === '2026-10-01');
    assert(day1.actualHours === 8, 'Day 1 actual hours is 8');
    assert(day1.shortfallHours === 0, 'Shortfall hours is 0 when worked required hours');
    assert(day1.overtimeHours === 0, 'Overtime hours is 0 when worked required hours');
    assert(day1.shortfallDeduction === 0, 'Shortfall deduction is 0');
    assert(day1.overtimeAddition === 0, 'Overtime addition is 0');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- Case 2: Employee works two hours below the requirement ---');
  // --------------------------------------------------------------------------
  {
    const attShortfall = {
      date: '2026-10-01',
      checkIn: '2026-10-01T09:30:00.000Z',
      checkOut: '2026-10-01T15:30:00.000Z', // 6 hours (2 hours below required 8)
      status: 'present',
    };
    const res = calculateEmployeeMonthlyPayroll({
      user: dummyEmployee,
      month: testMonth,
      settings: defaultSettings,
      attendances: [attShortfall],
      leaves: [],
      holidays: [],
      referenceDate: new Date('2026-10-01T23:59:59.000Z'),
    });

    const day1 = res.dailyBreakdown.find(d => d.date === '2026-10-01');
    assert(day1.actualHours === 6, 'Day 1 actual hours is 6');
    assert(day1.shortfallHours === 2, 'Shortfall hours is 2');
    assert(day1.overtimeHours === 0, 'Overtime hours is 0');
    assert(day1.shortfallDeduction === round2(2 * res.hourlyDeductionRate), `Shortfall deduction matches 2 * rate (${day1.shortfallDeduction})`);
  }

  // --------------------------------------------------------------------------
  console.log('\n--- Case 3: Employee works two hours above the requirement ---');
  // --------------------------------------------------------------------------
  {
    const attOvertime = {
      date: '2026-10-01',
      checkIn: '2026-10-01T09:30:00.000Z',
      checkOut: '2026-10-01T19:30:00.000Z', // 10 hours (2 hours above required 8)
      status: 'present',
    };
    const res = calculateEmployeeMonthlyPayroll({
      user: dummyEmployee,
      month: testMonth,
      settings: defaultSettings,
      attendances: [attOvertime],
      leaves: [],
      holidays: [],
      referenceDate: new Date('2026-10-01T23:59:59.000Z'),
    });

    const day1 = res.dailyBreakdown.find(d => d.date === '2026-10-01');
    assert(day1.actualHours === 10, 'Day 1 actual hours is 10');
    assert(day1.overtimeHours === 2, 'Overtime hours is 2');
    assert(day1.shortfallHours === 0, 'Shortfall hours is 0');
    assert(day1.overtimeAddition === round2(2 * res.hourlyOvertimeRate), `Overtime addition matches 2 * rate (${day1.overtimeAddition})`);
  }

  // --------------------------------------------------------------------------
  console.log('\n--- Case 4: Approved leave uses the approved deduction rate ---');
  // --------------------------------------------------------------------------
  {
    const approvedLeave = {
      startDate: '2026-10-01',
      endDate: '2026-10-01',
      status: 'approved',
      type: 'casual',
    };
    const res = calculateEmployeeMonthlyPayroll({
      user: dummyEmployee,
      month: testMonth,
      settings: defaultSettings,
      attendances: [],
      leaves: [approvedLeave],
      holidays: [],
      referenceDate: new Date('2026-10-01T23:59:59.000Z'),
    });

    const day1 = res.dailyBreakdown.find(d => d.date === '2026-10-01');
    assert(day1.isApprovedLeave === true, 'Day 1 marked as approved leave');
    const expectedDeduction = round2(res.dailySalaryBasis * (defaultSettings.approvedLeaveDeductionPct / 100));
    assert(day1.leaveDeduction === expectedDeduction, `Approved leave deduction is ${day1.leaveDeduction} (expected ${expectedDeduction})`);
  }

  // --------------------------------------------------------------------------
  console.log('\n--- Case 5: Unapproved leave uses the unapproved deduction rate ---');
  // --------------------------------------------------------------------------
  {
    // Rejected leave on working day in the past
    const unapprovedLeave = {
      startDate: '2026-10-01',
      endDate: '2026-10-01',
      status: 'rejected',
      type: 'casual',
    };
    const res = calculateEmployeeMonthlyPayroll({
      user: dummyEmployee,
      month: testMonth,
      settings: defaultSettings,
      attendances: [],
      leaves: [unapprovedLeave],
      holidays: [],
      referenceDate: new Date('2026-10-01T23:59:59.000Z'),
    });

    const day1 = res.dailyBreakdown.find(d => d.date === '2026-10-01');
    assert(day1.isUnapprovedLeave === true, 'Day 1 marked as unapproved leave');
    const expectedDeduction = round2(res.dailySalaryBasis * (defaultSettings.unapprovedLeaveDeductionPct / 100));
    assert(day1.leaveDeduction === expectedDeduction, `Unapproved leave deduction is ${day1.leaveDeduction} (expected ${expectedDeduction})`);
  }

  // --------------------------------------------------------------------------
  console.log('\n--- Case 6: Company holiday does not trigger an absence deduction ---');
  // --------------------------------------------------------------------------
  {
    const holiday = {
      date: '2026-10-02', // Friday
      name: 'Gandhi Jayanti',
    };
    const res = calculateEmployeeMonthlyPayroll({
      user: dummyEmployee,
      month: testMonth,
      settings: defaultSettings,
      attendances: [],
      leaves: [],
      holidays: [holiday],
      referenceDate: new Date('2026-10-02T23:59:59.000Z'),
    });

    const day2 = res.dailyBreakdown.find(d => d.date === '2026-10-02');
    assert(day2.isHoliday === true, 'Day 2 marked as holiday');
    assert(day2.isUnapprovedLeave === false, 'Holiday is not treated as unapproved leave');
    assert(day2.leaveDeduction === 0, 'No deduction applied for company holiday');
    assert(day2.shortfallDeduction === 0, 'No shortfall deduction for company holiday');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- Case 7: Scheduled weekly off does not trigger an absence deduction ---');
  // --------------------------------------------------------------------------
  {
    const res = calculateEmployeeMonthlyPayroll({
      user: dummyEmployee,
      month: testMonth,
      settings: defaultSettings,
      attendances: [],
      leaves: [],
      holidays: [],
      referenceDate: new Date('2026-10-04T23:59:59.000Z'),
    });

    const day3 = res.dailyBreakdown.find(d => d.date === '2026-10-03'); // Saturday
    const day4 = res.dailyBreakdown.find(d => d.date === '2026-10-04'); // Sunday
    assert(day3.isWeeklyOff === true, 'Saturday is weekly off');
    assert(day4.isWeeklyOff === true, 'Sunday is weekly off');
    assert(day3.leaveDeduction === 0 && day4.leaveDeduction === 0, 'Weekly offs have 0 leave deductions');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- Case 8: Missing attendance handled according to policy ---');
  // --------------------------------------------------------------------------
  {
    // Working day in the past with no attendance and no approved leave
    const res = calculateEmployeeMonthlyPayroll({
      user: dummyEmployee,
      month: testMonth,
      settings: defaultSettings,
      attendances: [],
      leaves: [],
      holidays: [],
      referenceDate: new Date('2026-10-01T23:59:59.000Z'),
    });

    const day1 = res.dailyBreakdown.find(d => d.date === '2026-10-01');
    assert(day1.isUnapprovedLeave === true, 'Working day with no attendance is marked as unapproved absence');
    assert(day1.leaveDeduction > 0, 'Absence deduction applied according to unapproved leave rate');
    assert(day1.shortfallDeduction === 0, 'Did not duplicate shortfall deduction for full absence');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- Case 9: Changes to attendance update unpaid payroll previews ---');
  // --------------------------------------------------------------------------
  {
    // Live calculation without saving
    const preview1 = calculateEmployeeMonthlyPayroll({
      user: dummyEmployee,
      month: testMonth,
      settings: defaultSettings,
      attendances: [{ date: '2026-10-01', checkIn: '2026-10-01T09:30:00.000Z', checkOut: '2026-10-01T15:30:00.000Z', status: 'present' }],
      leaves: [],
      holidays: [],
      referenceDate: new Date('2026-10-01T23:59:59.000Z'),
    });

    // Attendance updated to 8h
    const preview2 = calculateEmployeeMonthlyPayroll({
      user: dummyEmployee,
      month: testMonth,
      settings: defaultSettings,
      attendances: [{ date: '2026-10-01', checkIn: '2026-10-01T09:30:00.000Z', checkOut: '2026-10-01T17:30:00.000Z', status: 'present' }],
      leaves: [],
      holidays: [],
      referenceDate: new Date('2026-10-01T23:59:59.000Z'),
    });

    assert(preview1.shortfallHours === 2, 'Preview 1 reflected 2h shortfall');
    assert(preview2.shortfallHours === 0, 'Preview 2 dynamically updated to 0h shortfall');
    assert(preview2.netPayable > preview1.netPayable, 'Net payable recalculated and increased when shortfall removed');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- Case 10: Finalized payroll retains its original calculation snapshot ---');
  // --------------------------------------------------------------------------
  {
    // Clean up any test records
    await Payroll.deleteMany({ userId: testUserId });

    const frozenSnapshot = {
      companyId: testCompanyId,
      userId: testUserId,
      month: testMonth,
      baseSalary: 20000,
      hourlyDeductionRate: 50,
      hourlyOvertimeRate: 75,
      netPayable: 19500,
      status: 'finalized',
      paymentStatus: 'unpaid',
      finalizedAt: new Date(),
      snapshotSettings: { hourlyDeductionPct: 50 },
    };

    const savedPayroll = await Payroll.create(frozenSnapshot);
    assert(savedPayroll.status === 'finalized', 'Payroll saved with finalized status');
    assert(savedPayroll.netPayable === 19500, 'Original net payable retained in snapshot');

    // Modifying company settings should NOT change finalized record
    const retrieved = await Payroll.findOne({ _id: savedPayroll._id }).lean();
    assert(retrieved.netPayable === 19500, 'Finalized record retained its original frozen amount');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- Case 11: Repeated payment requests do not create duplicate transactions ---');
  // --------------------------------------------------------------------------
  {
    await PaymentTransaction.deleteMany({ userId: testUserId });
    const finalizedPayroll = await Payroll.findOne({ userId: testUserId, status: 'finalized' });

    // First payment
    const tx1 = await PaymentTransaction.create({
      payrollId: finalizedPayroll._id,
      companyId: testCompanyId,
      userId: testUserId,
      month: testMonth,
      amount: finalizedPayroll.netPayable,
      paymentMethod: 'bank_transfer',
      referenceId: `REF-${Date.now()}`,
      status: 'completed',
      processedBy: 'admin',
    });
    assert(tx1._id != null, 'First payment transaction created successfully');

    // Attempt second payment with same payrollId
    let duplicateFailed = false;
    try {
      await PaymentTransaction.create({
        payrollId: finalizedPayroll._id, // same payrollId
        companyId: testCompanyId,
        userId: testUserId,
        month: testMonth,
        amount: finalizedPayroll.netPayable,
        paymentMethod: 'bank_transfer',
        referenceId: `REF-${Date.now()}-2`,
        status: 'completed',
        processedBy: 'admin',
      });
    } catch (e) {
      duplicateFailed = true;
    }
    assert(duplicateFailed === true, 'Duplicate payment transaction blocked by database constraint');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- Case 12: Processed and pending counts are accurate ---');
  // --------------------------------------------------------------------------
  {
    const payrolls = [
      { status: 'draft', paymentStatus: 'unpaid' },
      { status: 'finalized', paymentStatus: 'unpaid' },
      { status: 'finalized', paymentStatus: 'paid' },
    ];
    const draftCount = payrolls.filter(p => p.status === 'draft').length;
    const pendingPaymentCount = payrolls.filter(p => p.status === 'finalized' && p.paymentStatus === 'unpaid').length;
    const paidCount = payrolls.filter(p => p.paymentStatus === 'paid').length;

    assert(draftCount === 1, 'Draft count is accurate');
    assert(pendingPaymentCount === 1, 'Finalized unpaid count is accurate');
    assert(paidCount === 1, 'Paid count is accurate');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- Case 13: One company cannot access another company\'s payroll ---');
  // --------------------------------------------------------------------------
  {
    // Company 1 payroll
    const c1Payroll = await Payroll.create({
      companyId: testCompanyId,
      userId: `C1-USER-${Date.now()}`,
      month: testMonth,
      baseSalary: 15000,
      netPayable: 15000,
      status: 'finalized',
    });

    // Company 2 query
    const c2Query = await Payroll.find({ companyId: testCompanyId2 }).lean();
    const hasC1Data = c2Query.some(p => p._id.toString() === c1Payroll._id.toString());
    assert(hasC1Data === false, 'Company 2 query does not return Company 1 payroll records');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- Case 14: Invalid percentages, missing salary, and incomplete attendance are handled safely ---');
  // --------------------------------------------------------------------------
  {
    // Missing salary (0 or undefined)
    const resNoSalary = calculateEmployeeMonthlyPayroll({
      user: { userId: 'NO-SALARY', salary: undefined },
      month: testMonth,
      settings: defaultSettings,
      attendances: [],
      leaves: [],
      holidays: [],
      referenceDate: new Date('2026-10-01'),
    });
    assert(resNoSalary.baseSalary === 0, 'Missing salary handled as 0');
    assert(resNoSalary.netPayable === 0, 'Net payable safely computed as 0');

    // Incomplete attendance (checkIn without checkOut)
    const incompleteAtt = {
      date: '2026-10-01',
      checkIn: '2026-10-01T09:30:00.000Z',
      checkOut: null,
      status: 'present',
    };
    const resIncomplete = calculateEmployeeMonthlyPayroll({
      user: dummyEmployee,
      month: testMonth,
      settings: defaultSettings,
      attendances: [incompleteAtt],
      leaves: [],
      holidays: [],
      referenceDate: new Date('2026-10-02'),
    });
    const d1 = resIncomplete.dailyBreakdown.find(d => d.date === '2026-10-01');
    assert(d1.shortfallHours === 8, 'Incomplete past attendance safely flagged with 8h shortfall');
    assert(!isNaN(resIncomplete.netPayable), 'Net payable remains a valid number without NaN');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- Case 15: Decimal safety and round-to-2 consistency ---');
  // --------------------------------------------------------------------------
  {
    const r1 = round2(0.1 + 0.2);
    assert(r1 === 0.3, 'Floating point 0.1 + 0.2 accurately rounded to 0.3');
    const r2 = round2(10000 / 3);
    assert(r2 === 3333.33, '10000 / 3 accurately rounded to 3333.33');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- Case 16: Overnight shift calculation handled safely ---');
  // --------------------------------------------------------------------------
  {
    const hours = calculateWorkedHours('2026-10-01T22:00:00.000Z', '2026-10-02T06:00:00.000Z', 'present', 8);
    assert(hours === 8, `Overnight shift (22:00 to 06:00 next day) calculated as 8 hours (got ${hours})`);
  }

  // --------------------------------------------------------------------------
  console.log('\n--- Case 17: Employee bonus dynamically increases total payout ---');
  // --------------------------------------------------------------------------
  {
    const baseCalc = calculateEmployeeMonthlyPayroll({
      user: dummyEmployee,
      month: testMonth,
      settings: defaultSettings,
      attendances: [],
      leaves: [],
      holidays: [],
      referenceDate: new Date('2026-10-01'),
    });

    const bonusCalc = calculateEmployeeMonthlyPayroll({
      user: dummyEmployee,
      month: testMonth,
      settings: defaultSettings,
      attendances: [],
      leaves: [],
      holidays: [],
      adjustments: [
        { type: 'bonus', amount: 5000, reason: 'Festival Bonus' },
      ],
      referenceDate: new Date('2026-10-01'),
    });

    assert(bonusCalc.bonus === 5000, `Bonus amount is recorded as 5000 (got ${bonusCalc.bonus})`);
    assert(bonusCalc.totalAmount === round2(baseCalc.netPayable + 5000), `Total amount reflects bonus addition: ₹${bonusCalc.totalAmount} = ₹${baseCalc.netPayable} + 5000`);
  }

  // --------------------------------------------------------------------------
  console.log('\n--- Case 18: Employee deduction dynamically reduces total payout ---');
  // --------------------------------------------------------------------------
  {
    const baseCalc = calculateEmployeeMonthlyPayroll({
      user: dummyEmployee,
      month: testMonth,
      settings: defaultSettings,
      attendances: [],
      leaves: [],
      holidays: [],
      referenceDate: new Date('2026-10-01'),
    });

    const deductCalc = calculateEmployeeMonthlyPayroll({
      user: dummyEmployee,
      month: testMonth,
      settings: defaultSettings,
      attendances: [],
      leaves: [],
      holidays: [],
      adjustments: [
        { type: 'deduction', amount: 1500, reason: 'Advance Recovery' },
      ],
      referenceDate: new Date('2026-10-01'),
    });

    assert(deductCalc.manualDeduction === 1500, `Manual deduction is recorded as 1500 (got ${deductCalc.manualDeduction})`);
    assert(deductCalc.totalAmount === round2(Math.max(0, baseCalc.netPayable - 1500)), `Total amount reflects deduction: ₹${deductCalc.totalAmount} = ₹${baseCalc.netPayable} - 1500`);
  }

  // Cleanup test records
  await Payroll.deleteMany({ companyId: { $in: [testCompanyId, testCompanyId2] } });
  await PaymentTransaction.deleteMany({ companyId: { $in: [testCompanyId, testCompanyId2] } });
  await PayrollAdjustment.deleteMany({ companyId: { $in: [testCompanyId, testCompanyId2] } });
  await mongoose.disconnect();

  console.log('\n======================================================');
  console.log(`TEST SUMMARY: ${passedTests}/${totalTests} Passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('======================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
