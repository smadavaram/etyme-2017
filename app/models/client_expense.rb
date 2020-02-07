# frozen_string_literal: true

class ClientExpense < ApplicationRecord
  enum status: %i[pending_expense not_submitted submitted approved bill_generated rejected invoice_generated paid]

  belongs_to :candidate, optional: true
  belongs_to :company, optional: true
  belongs_to :contract, optional: true
  belongs_to :user, optional: true
  belongs_to :job, optional: true
  belongs_to :ce_cycle, optional: true, foreign_key: :ce_cycle_id, class_name: 'ContractCycle'
  belongs_to :ce_ap_cycle, optional: true, foreign_key: :ce_ap_cycle_id, class_name: 'ContractCycle'
  has_many :expense_items, as: :expenseable, source_type: 'ClientExpense'
  has_one :contract_cycle, as: :cyclable

  # after_update :set_ce_on_seq
  accepts_nested_attributes_for :expense_items, allow_destroy: true, reject_if: :all_blank
  scope :not_submitted_expenses, -> { where(status: :not_submitted) }
  scope :submitted_client_expenses, -> { where(status: :submitted) }
  scope :approved_client_expenses, -> { where(status: :approved) }
  scope :rejected_client_expenses, -> { where(status: :rejected) }
  scope :all_client_expenses, -> { where(status: %i[submitted approved rejected not_submitted]) }
  scope :upcomming_client_expenses, -> { where('DATE(client_expenses.start_date) > ?', DateTime.now.end_of_day.to_date) }
  scope :between_date, ->(start_date, end_date) { start_date.present? && end_date.present? ? where('client_expenses.start_date BETWEEN ? AND ?', start_date, end_date).or(where('client_expenses.end_date BETWEEN ? AND ?', start_date, end_date)) : nil }

  def submitted(client_expense_params, _days, total_amount)
    assign_attributes(client_expense_params)
    self.amount = total_amount
    self.status = 1
    con_cycle = ContractCycle.find(ce_cycle_id)
    con_cycle.update_attributes(completed_at: Time.now, status: 'completed')
    con_cycle_ce_ap_start_date = ClientExpense.set_con_cycle_ce_ap_date(con_cycle&.contract&.sell_contract, con_cycle)
    con_cycle_ce_ap = ContractCycle.where(contract_id: con_cycle.contract_id,
                                          company_id: contract.sell_contract.company_id,
                                          note: 'ClientExpense Approve',
                                          cycle_type: 'ClientExpenseApprove',
                                          next_action: 'CleintExpenseInvoice').where('DATE(end_date) = ?', con_cycle_ce_ap_start_date.end_of_day.to_date).first
    self.ce_ap_cycle_id = con_cycle_ce_ap.id
    save
  end

  def update_amount
    update(amount: expense_items.sum('unit_price * quantity'), status: :not_submitted)
  end

  def set_ce_on_seq
    contract.set_on_seq
    return unless self&.amount.to_i > 0 && status == 'submitted'

    ledger = Sequence::Client.new(
      ledger_name: 'company-dev',
      credential: 'OUUY4ZFYQO4P3YNC5JC3GMY7ZQJCSNTH'
    )
    ce_issue = ledger.transactions.transact do |builder|
      builder.issue(
        flavor_id: 'usd',
        amount: self&.amount.to_i,
        destination_account_id: 'cons_' + self&.contract.buy_contract.candidate_id.to_s,
        action_tags: {
          type: 'issue',
          contract: contract_id,
          candidate: contract.buy_contract.candidate_id.to_s,
          cycle_id: ce_cycle_id,
          start_date: start_date,
          end_date: end_date
        }
      )
    end
  end

  def self.transfer_after_approve_on_seq(client_expense, amount)
    ledger = Sequence::Client.new(
      ledger_name: 'company-dev',
      credential: 'OUUY4ZFYQO4P3YNC5JC3GMY7ZQJCSNTH'
    )
    client_expense.contract.set_on_seq
    ce_issue = ledger.transactions.transact do |builder|
      builder.transfer(
        flavor_id: 'usd',
        amount: amount.to_i,
        source_account_id: 'cons_' + client_expense&.contract.buy_contract.candidate_id.to_s,
        destination_account_id: 'cont_' + client_expense.contract_id.to_s,
        action_tags: {
          type: 'transfer',
          contract: client_expense.contract_id,
          candidate: client_expense.contract.buy_contract.candidate_id.to_s,
          cycle_id: client_expense.ce_cycle_id,
          start_date: client_expense.start_date,
          end_date: client_expense.end_date
        }
      )
    end
  end

  def self.retire_after_reject_on_seq(client_expense, amount)
    ledger = Sequence::Client.new(
      ledger_name: 'company-dev',
      credential: 'OUUY4ZFYQO4P3YNC5JC3GMY7ZQJCSNTH'
    )
    client_expense.contract.set_on_seq
    ce_issue = ledger.transactions.transact do |builder|
      builder.retire(
        flavor_id: 'usd',
        amount: amount.to_i,
        source_account_id: 'cons_' + client_expense&.contract.buy_contract.candidate_id.to_s,
        action_tags: {
          type: 'retire-rejected',
          contract: client_expense.contract_id,
          candidate: client_expense.contract.buy_contract.candidate_id.to_s,
          cycle_id: client_expense.ce_cycle_id,
          start_date: client_expense.start_date,
          end_date: client_expense.end_date
        }
      )
    end
  end

  def self.set_con_cycle_ce_ap_date(sell_contract, con_cycle)
    @ce_type = sell_contract&.ce_approve
    if sell_contract&.ce_ap_day_of_week.present?
      @ce_day_of_week = Date.parse(sell_contract&.ce_ap_day_of_week&.titleize).try(:strftime, '%A')
    else
      @ce_ap_day_of_week = 'mon'
    end
    @ce_date_1 = sell_contract&.ce_ap_date_1.try(:strftime, '%e')
    @ce_date_2 = sell_contract&.ce_ap_date_2.try(:strftime, '%e')
    @ce_end_of_month = sell_contract&.ce_ap_end_of_month
    @ce_day_time = sell_contract&.ce_ap_day_time.try(:strftime, '%H:%M')
    con_cycle_ce_start_date = case @ce_type
                              when 'daily'
                                con_cycle.start_date
                              when 'weekly'
                                date_of_next(@ce_day_of_week, con_cycle)
                              when 'monthly'
                                if @ce_end_of_month
                                  DateTime.now.end_of_month
                                else
                                  montly_approval_date(con_cycle)
                                end
                              when 'twice a month'
                                twice_a_month_approval_date(con_cycle)
                              else
                                con_cycle.start_date
                              end
    con_cycle_ce_start_date
  end

  def self.set_con_cycle_ce_in_date(sell_contract, con_cycle)
    @ce_type = sell_contract&.ce_invoice
    @ce_day_of_week = if sell_contract&.ce_in_day_of_week.present?
                        Date.parse(sell_contract&.ce_in_day_of_week&.titleize).try(:strftime, '%A')
                      else
                        'mon'
                      end
    @ce_date_1 = sell_contract&.ce_in_date_1.try(:strftime, '%e')
    @ce_date_2 = sell_contract&.ce_in_date_2.try(:strftime, '%e')
    @ce_end_of_month = sell_contract&.ce_in_end_of_month
    @ce_day_time = sell_contract&.ce_in_day_time.try(:strftime, '%H:%M')
    con_cycle_ce_start_date = case @ce_type
                              when 'daily'
                                con_cycle.start_date
                              when 'weekly'
                                date_of_next(@ce_day_of_week, con_cycle)
                              when 'monthly'
                                if @ce_end_of_month
                                  DateTime.now.end_of_month
                                else
                                  montly_approval_date(con_cycle)
                                end
                              when 'twice a month'
                                twice_a_month_approval_date(con_cycle)
                              else
                                con_cycle.start_date
                              end
    con_cycle_ce_start_date
  end

  def self.montly_approval_date(con_cycle)
    day = @ce_date_1&.to_i.present? ? @ce_date_1&.to_i : 0
    next_month_year = con_cycle.start_date.strftime('%d').to_i <= day ? con_cycle.start_date : (con_cycle.start_date + 1.month)
    month = next_month_year&.strftime('%m').to_i
    year = next_month_year&.strftime('%Y').to_i
    con_cycle_ce_start_date = DateTime.new(year, month, day)
  end

  def self.date_of_next(day_of_week, con_cycle)
    day_of_week = DateTime.parse(day_of_week).wday
    ce_day_of_week = DateTime.parse(con_cycle&.contract&.sell_contract.ce_day_of_week).wday if con_cycle.contract.sell_contract.time_sheet == 'weekly'
    date = con_cycle.start_date.to_date + ((day_of_week - con_cycle.start_date.to_date.wday) % 7)
    if day_of_week >= con_cycle.start_date.wday
      date = (date - con_cycle.start_date.to_date <= 5) && con_cycle.start_date.wday != 0 ? date + 7.days : date
    else
      date
    end
    if ce_day_of_week.present? && ce_day_of_week > day_of_week
      date += 7.days
    else
      date
    end
  end
end
