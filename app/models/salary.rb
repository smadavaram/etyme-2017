# frozen_string_literal: true

class Salary < ApplicationRecord
  require 'sequence'
  include Rails.application.routes.url_helpers
  enum status: %i[pending open calculated commission_calculated processed aggregated cleared]
  belongs_to :company, optional: true
  belongs_to :contract, optional: true
  belongs_to :candidate, optional: true
  belongs_to :sclr_cycle, class_name: 'ContractCycle', foreign_key: :sclr_cycle_id, optional: true
  belongs_to :sc_cycle, class_name: 'ContractCycle', foreign_key: :sc_cycle_id, optional: true
  belongs_to :sp_cycle, class_name: 'ContractCycle', foreign_key: :sp_cycle_id, optional: true

  has_many :sc_calculateds, foreign_key: :sc_cycle_id, class_name: 'Salary'
  has_many :sp_processeds, foreign_key: :sp_cycle_id, class_name: 'Salary'
  has_many :sclr_cleareds, foreign_key: :sclr_cycle_id, class_name: 'Salary'

  has_many :salary_items
  has_one :contract_cycle, as: :cyclable
  has_many :contract_books, as: :bookable
  has_many :commission_queues

  scope :open_salaries, -> { where(status: :open) }
  scope :calculated_salaries, -> { where(status: :calculated) }
  scope :processed_salaries, -> { where(status: :processed) }
  scope :cleared_salaries, -> { where(status: [:paid]) }

  # after_update :set_salary_settlement_on_seq, :if => proc { |obj| obj.status == 'calculated' }

  # after_update :set_salary_process_on_seq, :if => proc { |obj| obj.status == 'processed' }

  def self.generate_csv(ids)
    attributes = %w[Name Status Living_State City Address Zip Amount]
    salaries = Salary.where(id: ids)
    amounts = salaries.group(:candidate_id).sum(:total_amount)
    # salaries.update_all(status: 'aggregated')
    CSV.generate(headers: true) do |csv|
      csv << attributes
      amounts.each do |s|
        can = Candidate.find_by(id: s[0])
        csv << [can&.full_name, can&.visas&.first&.title, can&.addresses&.first&.state, can&.addresses&.first&.city, can&.addresses&.first&.address_1, can&.addresses&.first&.zip_code, s[1].to_i]
      end
    end
  end

  def self.set_con_cycle_sp_date(buy_contract, con_cycle)
    @sp_type = buy_contract&.salary_process
    @sp_day_of_week = if buy_contract&.sp_day_of_week.present?
                        Date.parse(buy_contract&.sp_day_of_week&.titleize).try(:strftime, '%A')
                      else
                        'mon'
                      end

    @sc_day_of_week = if buy_contract&.sc_day_of_week.present?
                        Date.parse(buy_contract&.sc_day_of_week&.titleize).try(:strftime, '%A')
                      else
                        'mon'
                      end

    @sclr_date_1 = buy_contract&.sclr_date_1
    @sclr_date_2 = buy_contract&.sclr_date_2
    @sclr_end_of_month = buy_contract&.sclr_end_of_month
    @sclr_day_time = buy_contract&.sclr_day_time.try(:strftime, '%H:%M')

    @sp_date_1 = buy_contract&.sp_date_1
    @sp_date_2 = buy_contract&.sp_date_2
    @sp_end_of_month = buy_contract&.sp_end_of_month
    @sp_day_time = buy_contract&.sp_day_time.try(:strftime, '%H:%M')

    @sc_date_1 = buy_contract&.sc_date_1
    @sc_date_2 = buy_contract&.sc_date_2
    @sc_end_of_month = buy_contract&.sc_end_of_month
    @sc_day_time = buy_contract&.sc_day_time.try(:strftime, '%H:%M')

    con_cycle_start_date = case @sp_type
                           when 'daily'
                             con_cycle.start_date
                           when 'weekly'
                             date_of_next(@sp_day_of_week, con_cycle)
                           when 'monthly'
                             # if @end_of_month
                             #   con_cycle_start_date = DateTime.now.end_of_month
                             # else
                             #   con_cycle_start_date = montly_approval_date(con_cycle, buy_contract)
                             # end
                             montly_approval_date(con_cycle)
                           when 'twice a month'
                             twice_a_month_approval_date(con_cycle, buy_contract)

                           else
                             con_cycle.start_date
                           end
    con_cycle_start_date
  end

  # def self.set_con_cycle_sclr_date(buy_contract, con_cycle)
  #   @sclr_type = buy_contract&.salary_process
  #   if buy_contract&.sclr_day_of_week.present?
  #     @sclr_day_of_week = Date.parse(buy_contract&.sclr_day_of_week&.titleize).try(:strftime, '%A')
  #   else
  #     @sclr_day_of_week = 'mon'
  #   end
  #   @date_1 = buy_contract&.sclr_date_1.try(:strftime, '%e')
  #   @date_2 = buy_contract&.sclr_date_2.try(:strftime, '%e')
  #   @end_of_month = buy_contract&.sclr_end_of_month
  #   @day_time = buy_contract&.sclr_day_time.try(:strftime, '%H:%M')
  #   case @sclr_type
  #   when 'daily'
  #     con_cycle_start_date = con_cycle.start_date
  #   when 'weekly'
  #     con_cycle_start_date = date_of_next(@sclr_day_of_week,con_cycle)
  #   when 'monthly'
  #     if @end_of_month
  #       con_cycle_start_date = DateTime.now.end_of_month
  #     else
  #       con_cycle_start_date = montly_approval_date(con_cycle, buy_contract)
  #     end
  #   when 'twice a month'
  #     con_cycle_start_date = twice_a_month_approval_date(con_cycle)
  #   else
  #     con_cycle_start_date = con_cycle.start_date
  #   end
  #   return con_cycle_start_date
  # end

  def self.date_of_next(day_of_week, con_cycle)
    day_of_week = DateTime.parse(day_of_week).wday
    # sc_day_of_week = DateTime.parse(con_cycle&.contract&.buy_contracts&.first&.sc_day_of_week).wday if con_cycle.contract.buy_contracts.first.salary_calculation == 'weekly'
    date = con_cycle.start_date.to_date + ((day_of_week - con_cycle.start_date.to_date.wday) % 7)
    if day_of_week <= con_cycle.start_date.wday
      date = (date - con_cycle.start_date.to_date <= 5) && con_cycle.start_date.wday != 0 ? date + 7.days : date
    else
      date
    end
    # if sc_day_of_week > day_of_week
    #   date = date+7.days
    # else
    #   date
    # end
  end

  def self.montly_approval_date(con_cycle)
    # day = @date_1&.to_i.present? ? @date_1&.to_i : 0
    # next_month_year = con_cycle.start_date.strftime("%d").to_i <= day ? con_cycle.start_date : (con_cycle.start_date+1.month)
    # if buy_contract.payment_term = 'end_of_mon'
    #   month = next_month_year&.strftime("%m").to_i+1
    # elsif buy_contract.payment_term = 'end_of_pre_mon'
    #   month = next_month_year&.strftime("%m").to_i+2
    # end
    # year = next_month_year&.strftime("%Y").to_i
    # con_cycle_start_date = DateTime.new(year, month, day)

    con_cycle_sc_start_date = con_cycle.doc_date - (@sclr_date_1&.day - @sc_date_1&.day).to_i
    con_cycle_sp_start_date = con_cycle.doc_date - (@sclr_date_1&.day - @sp_date_1&.day).to_i
    [con_cycle_sc_start_date, con_cycle_sp_start_date]
  end

  def self.twice_a_month_approval_date(con_cycle, _buy_contract)
    day_1 = @sp_date_1
    day_2 = @sp_date_2.present? ? @sp_date_2 : 0

    if con_cycle.start_date.day <= day_1.day

      con_cycle_sc_start_date = con_cycle.doc_date - (@sclr_date_1&.day - @sc_date_1&.day).to_i
      con_cycle_sp_start_date = con_cycle.doc_date - (@sclr_date_1&.day - @sp_date_1&.day).to_i
      #   day = @date_1&.to_i
      #   next_month_year = con_cycle.start_date
      #   month = next_month_year&.strftime("%m").to_i
      #   year = next_month_year&.strftime("%Y").to_i
    elsif con_cycle.start_date.day > day_1.day && con_cycle.start_date.day <= day_2.day

      con_cycle_sc_start_date = con_cycle.doc_date - (@sclr_date_2&.day - @sc_date_2&.day).to_i
      con_cycle_sp_start_date = con_cycle.doc_date - (@sclr_date_2&.day - @sp_date_2&.day).to_i
      #   day = @date_2&.to_i
      #   next_month_year = con_cycle.start_date
      #   month = next_month_year&.strftime("%m").to_i
      #   year = next_month_year&.strftime("%Y").to_i
    elsif con_cycle.start_date.day > day_2.day && !@end_of_month

      con_cycle_sc_start_date = con_cycle.doc_date - (@sclr_date_1&.day - @sc_date_1&.day).to_i
      con_cycle_sp_start_date = con_cycle.doc_date - (@sclr_date_1&.day - @sp_date_1&.day).to_i
      #   day = @date_1&.to_i
      #   next_month_year = con_cycle.start_date+1.month
      #   month = next_month_year&.strftime("%m").to_i
      #   year = next_month_year&.strftime("%Y").to_i
    elsif @end_of_month

      con_cycle_sc_start_date = con_cycle.doc_date.end_of_month
      con_cycle_sp_start_date = con_cycle.doc_date.end_of_month
      #   next_month_year = con_cycle.start_date.end_of_month
      #   day = next_month_year.strftime('%e').to_i
      #   month = next_month_year&.strftime("%m").to_i
      #   year = next_month_year&.strftime("%Y").to_i
    end

    # con_cycle_sp_start_date = DateTime.new(year, month, day)

    # con_cycle_sc_start_date = con_cycle.doc_date - (@sclr_date_1&.day - @sc_date_1&.day).to_i
    # con_cycle_sp_start_date = con_cycle.doc_date - (@sclr_date_1&.day - @sp_date_1&.day).to_i

    [con_cycle_sc_start_date, con_cycle_sp_start_date]
  end

  def set_salary_settlement_on_seq
    ledger = Sequence::Client.new(
      ledger_name: 'company-dev',
      credential: 'OUUY4ZFYQO4P3YNC5JC3GMY7ZQJCSNTH'
    )

    if contract.buy_contract.contract_type == 'C2C'
      receiver = 'vendor_' + contract.buy_contract.company_id.to_s
      receiver_advance = 'vendor_' + contract.buy_contract.company_id.to_s + '_advance'
      receiver_settlement = 'vendor_' + contract.buy_contract.company_id.to_s + '_settlement'
    elsif receiver == 'cons_' + candidate_id.to_s
      receiver_advance = 'cons_' + candidate_id.to_s + '_advance'
      receiver_settlement = 'cons_' + candidate_id.to_s + '_settlement'
    end
    return unless approved_amount > 0 && total_amount > 0

    tx = ledger.transactions.transact do |builder|
      builder.retire(
        flavor_id: 'usd',
        amount: (approved_amount.to_i * 100),
        source_account_id: receiver,
        action_tags: { type: 'approved amount' }
      )

      if salary_advance > 0
        builder.retire(
          flavor_id: 'usd',
          amount: (salary_advance.to_i * 100),
          source_account_id: receiver_advance,
          action_tags: { type: 'salary advance' }
        )
      end
      builder.issue(
        flavor_id: 'usd',
        amount: (self&.total_amount.to_i * 100),
        destination_account_id: receiver_settlement,
        action_tags: {
          type: 'issue',
          contract: contract_id,
          salary_id: id
        }
      )
    end
  end

  def set_salary_process_on_seq
    ledger = Sequence::Client.new(
      ledger_name: 'company-dev',
      credential: 'OUUY4ZFYQO4P3YNC5JC3GMY7ZQJCSNTH'
    )
    if contract.buy_contract.contract_type == 'C2C'
      source = "vendor_#{contract.buy_contract.company_id}_settlement"
      destination = "vendor_#{contract.buy_contract.company_id}_process"
    else
      source = "cons_#{contract.buy_contract.candidate.id}_settlement"
      destination = "cons_#{contract.buy_contract.candidate.id}_process"
    end
    # self.contract.set_on_seq
    return unless total_amount > 0

    tx = ledger.transactions.transact do |builder|
      builder.transfer(
        flavor_id: 'usd',
        amount: total_amount.to_i * 100,
        source_account_id: source,
        destination_account_id: destination,
        action_tags: {
          type: 'transfer',
          contract: contract_id,
          salary_id: id,
          'TransactionType' => contract.buy_contract.contract_type
        }
      )
      # builder.retire(
      #   flavor_id: 'usd',
      #   amount: self.salary_advance.to_i,
      #   source_account_id: "comp_"+self.contract.company_id.to_s+"_treasury",
      #   action_tags: {type: 'processed amount'}
      # )
    end
  end

  def calculate_advance
    -salary_items.joins('JOIN expenses ON expenses.id = salary_items.salaryable_id JOIN expense_accounts ON expenses.id = expense_accounts.expense_id').where("expenses.bill_type": Expense.bill_types[:salary_advanced], "expense_accounts.status": ExpenseAccount.statuses[:cleared]).sum('expense_accounts.payment')
  end

  def calculate_expense
    salary_items.joins('JOIN expenses ON expenses.id = salary_items.salaryable_id JOIN expense_accounts ON expenses.id = expense_accounts.expense_id').where("expenses.bill_type": Expense.bill_types[:company_expense], "expense_accounts.status": ExpenseAccount.statuses[:cleared]).sum('expense_accounts.payment')
  end

  def earned_commissions
    CommissionQueue.pending.joins(contract_sale_commision: :csc_accounts).where('accountable_id = ? AND accountable_type = ?', candidate.id, 'Candidate')
  end
end
