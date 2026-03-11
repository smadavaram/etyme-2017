# frozen_string_literal: true

class SalaryCalculationService
  attr_reader :company

  def initialize(company)
    @company = company
  end

  def process_salary_cycles(contract_cycles)
    contract_cycles.each do |cc|
      next unless %i[pending open].include?(cc.cyclable.status.to_sym)

      timesheets = Timesheet.approved.joins(:contract_cycle)
                            .where("contract_cycles.contract_id": cc.contract_id)

      timesheets.each do |ts|
        cc.cyclable.salary_items.build(salaryable: ts).save
      end

      expenses = cc.contract.expenses.where(bill_type: %i[salary_advanced company_expense])

      cc.cyclable.contract_expenses = cc.contract.expenses
        .where(bill_type: "company_expense")
        .map { |e| e.total_amount if e.salary_ids.include?(cc.id.to_s) }
        .compact.sum

      cc.cyclable.salary_advance = cc.contract.expenses
        .where(bill_type: "salary_advanced")
        .map { |e| e.total_amount if e.salary_ids.include?(cc.id.to_s) }
        .compact.sum

      cc.cyclable.total_amount = (cc.cyclable.approved_amount || 0) +
        cc.cyclable.contract_expenses +
        cc.cyclable.salary_advance +
        (cc.cyclable.pending_amount || 0) +
        (cc.cyclable&.commission_amount)
      cc.cyclable.save

      expenses.each do |expense|
        cc.cyclable.salary_items.build(salaryable: expense).save if expense.salary_ids.include?(cc.id.to_s)
      end
    end
  end

  def calculate(salary_cycle_params)
    salary_cycle_params.each do |key, value|
      salary = Salary.find_by(sclr_cycle_id: key)
      next unless salary

      salary.approved_amount = value[:approved_amount].to_i
      salary.pending_amount = value[:pending_amount].to_i
      salary.salary_advance = value[:salary_advance].to_i
      salary.total_amount = value[:approved_amount].to_i + value[:pending_amount].to_i - value[:salary_advance].to_i
      salary.status = 'calculated'
      salary.save
      cc = ContractCycle.find_by(id: salary.sc_cycle_id)
      cc.update(status: 'completed')
    end
  end

  def process(salary_cycle_params)
    salary_cycle_params.each do |key, value|
      salary = Salary.find_by(sclr_cycle_id: key)
      salary.balance = (salary.total_amount.to_i + CscAccount.where(accountable_id: salary.candidate_id, accountable_type: 'Candidate').sum(:total_amount).to_i) - value[:salary_calculated].to_i
      next_salary = Salary.where(end_date: salary.end_date + 1.month, contract_id: salary.contract_id).first
      next_salary&.update(pending_amount: salary.balance)
      salary.total_amount = value[:salary_calculated].to_i
      salary.status = 'processed'
      salary.save
      cc = ContractCycle.find_by(id: salary.sp_cycle_id)
      cc.update(status: 'completed')
    end
  end

  def clear(cycle_ids)
    cycle_ids.each do |cycle_id|
      ce_amount = ContractExpense.where(cycle_id: cycle_id).sum(:amount)
      salary = Salary.find_by(sclr_cycle_id: cycle_id)
      commission_amount = CscAccount.where(contract_id: salary.contract_id).sum(:total_amount).to_i
      company_expense = Expense.where(bill_type: 'company_expense')
        .select { |m| m.salary_ids.include? salary.sclr_cycle_id.to_s }
        .map { |x| x.total_amount.to_i / x.salary_ids.length }
        .sum(&:to_i)

      salary.total_amount = salary.total_amount.to_i - (ce_amount.to_i + commission_amount + company_expense.to_i)
      salary.save
      salary.update(status: 'cleared')
      cc = ContractCycle.find_by(id: salary.sclr_cycle_id)
      cc.update(status: 'completed')
    end
  end

  def calculate_commission_for_salaries(salary_ids)
    Salary.where(id: salary_ids).each do |salary|
      next if salary.commission_calculated

      salary.commission_amount = get_commission(salary)
      send_commission(salary, salary.contract.buy_contract) unless salary.commission_calculated
      salary.total_amount = salary.total_amount + salary.commission_amount
      salary.save
    end
  end

  def process_salary_expenses(salary_ids)
    salaries = Salary.calculated.where(id: salary_ids)
    salaries.each do |salary|
      book_entry = salary.contract.contract_books.salary.buy_contract.build(
        bookable: salary,
        beneficiary: salary.candidate,
        total: salary.total_amount,
        paid: salary.billing_amount
      )
      if book_entry.save
        previous = book_entry.is_first? ? 0.0 : book_entry.previous
        salary.update(status: :processed, previous_balance: previous, total_amount: salary.total_amount + previous)
      end
    end
  end

  def add_contract_expense_amounts(salary_ids)
    salaries = Salary.where(id: salary_ids, status: %i[open pending])
    salaries.each do |salary|
      advance = salary.calculate_advance
      salary.update_attributes(
        total_amount: salary.approved_amount.to_f + advance + salary.commission_amount.to_f,
        salary_advance: advance
      )
    end
    salaries.update_all(status: 'calculated')
  end

  def add_contract_addable_expense_amounts(salary_ids)
    salaries = Salary.processed.where(id: salary_ids)
    salaries.each do |salary|
      salary.update_attributes(contract_expenses: salary.calculate_expense)
    end
  end

  def calculate_commission_accounts(comm_ids, cycle_ids)
    if comm_ids.present?
      comm_ids.each do |key, _value|
        csca = CscAccount.find_by(id: key.to_i)
        csca.set_commission_calculate_on_seq
      end
    end
    if cycle_ids.present?
      cycle_ids.each do |cycle_id|
        salary = Salary.find_by(sclr_cycle_id: cycle_id.to_i)
        salary&.update(status: 'commission_calculated')
      end
    end
  end

  def add_payment(salary, payment_amount)
    if payment_amount.to_f + salary.billing_amount <= salary.total_amount
      if salary.update(billing_amount: payment_amount.to_f + salary.billing_amount)
        salary.contract_cycle.contract.company.etyme_transactions.create!(
          amount: (payment_amount.to_f) * -1,
          transaction_type: 'Salary',
          salary_id: salary.id,
          contract_id: salary.contract_id,
          transaction_user_type: 'candidate',
          transaction_user_id: salary.candidate_id,
          is_processed: true
        )
        { success: true, message: 'Payment is added to salary' }
      else
        { success: false, errors: salary.errors.full_messages }
      end
    else
      { success: false, errors: ['Cannot pay more then total salary amount'] }
    end
  end

  private

  def get_commission(salary)
    comm = ContractSaleCommision.find_by(buy_contract_id: salary.contract_id)
    return 0 if comm.nil?

    comm.frequency == 'perhour' ? (salary.approved_amount * comm.rate) / 100.0 : comm.limit
  end

  def send_commission(salary, buy_contract)
    buy_contract.contract_sale_commisions.each do |commission|
      amount = commission.frequency == 'perhour' ? (salary.approved_amount * commission.rate) / 100.0 : commission.limit
      buy_contract.commission_queues.pending.create(salary: salary, contract_sale_commision: commission, total_amount: amount)
      salary.commission_calculated = true
    end
  end
end
