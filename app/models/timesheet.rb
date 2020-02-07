# frozen_string_literal: true

class Timesheet < ApplicationRecord
  include Rails.application.routes.url_helpers

  # enum status: [:open,:pending_review, :approved , :partially_approved , :rejected , :submitted , :invoiced]
  enum status: %i[open submitted approved partially_approved rejected invoiced salaried]

  belongs_to :company, optional: true
  belongs_to :contract, optional: true
  belongs_to :user, optional: true
  belongs_to :job, optional: true
  belongs_to :invoice, optional: true
  belongs_to :candidate, optional: true
  has_one :contract_cycle, as: :cyclable
  # has_many   :timesheet_logs , dependent: :destroy
  has_many :timesheet_approvers, dependent: :destroy
  has_many :transactions
  # has_many   :transactions  , through: :timesheet_logs
  has_many :contract_salary_histories, as: :salable, dependent: :destroy
  belongs_to :ts_cycle, optional: true, foreign_key: :ts_cycle_id, class_name: 'ContractCycle'
  belongs_to :ta_cycle, optional: true, foreign_key: :ta_cycle_id, class_name: 'ContractCycle'
  has_many :invoice_items, as: :itemable
  has_many :salary_items, as: :salaryable

  accepts_nested_attributes_for :transactions

  # before_validation :set_recurring_timesheet_cycle
  # after_update :set_ts_on_seq, if: Proc.new { |t| t.status_changed? && t.submitted? && t.total_time.to_f > 0 }
  # after_update  :set_ta_on_seq, if: Proc.new{|t| t.status_changed? && t.approved? && t.total_time.to_f > 0}

  # after_create  :create_timesheet_logs
  # after_create  :notify_timesheet_created
  # after_update :update_pending_timesheet_logs, if: Proc.new{|t| t.status_changed? && t.approved?}

  # after_update :set_contract_salary_histories, if: Proc.new { |t| t.status_changed? && t.approved? }
  # after_update :set_cost_and_time,  if: Proc.new { |t| t.approved? }

  validates :start_date, presence: true
  validates :end_date, presence: true
  validates :status, inclusion: { in: statuses.keys }

  # validates_uniqueness_of :start_date, scope: :contract_id, :message => "Timesheet already submitted."

  scope :not_invoiced, -> { where(invoice_id: nil) }
  scope :open_timesheets, -> { where(status: :open) }
  scope :all_timesheets, -> { where(status: %i[submitted approved rejected]) }
  scope :submitted_timesheets, -> { where(status: :submitted) }
  scope :approved_timesheets, -> { where(status: :approved) }
  scope :rejected_timesheets, -> { where(status: :rejected) }
  scope :invoice_timesheets, ->(invoice) { where(contract_id: invoice.contract_id).where('start_date >= ? AND end_date <= ?', invoice.start_date, invoice.end_date).order(id: :desc) }
  scope :upcomming_timesheets, -> { where('DATE(timesheets.start_date) > ?', DateTime.now.end_of_day.to_date) }
  scope :timesheet_by_frequency, ->(type, candidate) { where(id: candidate.contract_cycles.send(type).where(cyclable_type: 'Timesheet').pluck(:cyclable_id)) }
  scope :between_date, ->(start_date, end_date) { start_date.present? && end_date.present? ? where('timesheets.start_date BETWEEN ? AND ?', start_date, end_date).or(where('timesheets.end_date BETWEEN ? AND ?', start_date, end_date)) : nil }

  def assignee
    contract.assignee
  end

  def can_approve?(user, _company)
    current_company.approvals.timesheet.pluck(:user_id).include?(user.id)
  end

  def self.find_sent_or_received(timesheet_id, obj)
    joins(:job).where('timesheets.id = :t_id and (timesheets.company_id = :obj_id or (jobs.company_id = :obj_id))', obj_id: obj.id, t_id: timesheet_id).first
  end

  def is_already_submitted?(user)
    timesheet_approvers.where('timesheet_approvers.user_id = ? AND (timesheet_approvers.status = ?)', user.id, Timesheet.statuses[:submitted]).present?
  end

  def is_already_approved_or_rejected?(user)
    timesheet_approvers.where('timesheet_approvers.user_id = ? AND (timesheet_approvers.status = ? OR timesheet_approvers.status = ?)', user.id, Timesheet.statuses[:approved], Timesheet.statuses[:rejected]).present?
  end

  def calculate_total_time
    transactions.sum(:total_time)
  end

  def set_cost_and_time
    time = transactions.sum(:total_time)
    change_rate = contract_cycle.cycle_of.change_rates.where('from_date <= ? and to_date >= ?', start_date, end_date).order(:from_date).first
    rate = change_rate&.rate || 0
    total_hrs = change_rate&.working_hrs || 0
    update!(total_time: time, amount: rate * time, rate: rate, expected_hrs: total_hrs)
  end

  def approved_total_time
    total_time = 0.0
    timesheet_logs.approved.each do |t|
      total_time += t.accepted_total_time
    end
    total_time
  end

  def notify_timesheet_created
    contract.assignee.notifications.create(message: contract.assignee.full_name + " your timesheet for the <a href='http://#{contract.assignee.etyme_url + contract_path(contract)}'>#{contract.job.title}</a> has been created <a href='http://#{contract.assignee.etyme_url + timesheet_timesheet_log_path(self, timesheet_logs.last)}'>  Click here </a> to start logging time accordingly ", title: 'Timesheet')
  end

  # def approved_total_hours
  #   approved_total_time / 3600.0
  # end

  # def total_amount
  #   amount = 0
  #   self.timesheet_logs.approved.each do |t| amount = amount + t.total_amount end
  #   amount
  # end

  def approvers
    title = ''
    timesheet_approvers.each do |aa|
      title += aa.status_by
    end
    title
  end

  # private
  def create_timesheet_logs
    timesheet_logs.create(transaction_day: start_date)
    delay(run_at: next_timesheet_created_date).schedule_timesheet if next_timesheet_created_date.present? && contract.is_not_ended?
    # self.schedule_timesheet if self.next_timesheet_created_date.present? && self.contract.is_not_ended?
  end

  def schedule_timesheet
    contract.timesheets.create(user_id: user_id, job_id: job.id, start_date: end_date + 1.day, company_id: company_id, status: 'open')
    pending_review!
  end

  def set_recurring_timesheet_cycle
    temp_date = start_date + TIMESHEET_FREQUENCY[contract.time_sheet_frequency].days - 1
    if contract.end_date <= temp_date
      self.next_timesheet_created_date = nil
      self.end_date = contract.end_date
    else
      self.next_timesheet_created_date = temp_date - 1
      self.end_date = temp_date
    end
  end

  def update_pending_timesheet_logs
    timesheet_logs.pending.each(&:approved!)
  end

  def contract_id=(new_contract_id)
    write_attribute(:contract_id, new_contract_id)
    con = Contract.find(new_contract_id)
    self.job_id = con.job_id
    self.company_id = con.company_id
  end

  def set_contract_salary_histories
    amoount = contract.buy_contract.payrate.present? ? (total_time * contract.buy_contract.payrate) : 0
    contract_amount = contract.salary_to_pay
    ContractSalaryHistory.create(contract_id: contract_id,
                                 company_id: contract.company_id,
                                 candidate_id: contract.buy_contract.candidate_id,
                                 salary_type: 'CREDIT',
                                 description: 'Timesheet Approved',
                                 amount: amoount,
                                 final_amount: (contract_amount + amoount),
                                 salable: self)

    contract.update(salary_to_pay: (contract_amount + amoount))
  end

  def get_total_amount
    if contract.buy_contract.payrate
      total_time * contract.buy_contract.payrate
    else
      total_time * 0
    end
  end

  def submitted
    update(status: :submitted)
    contract_cycle.update(status: :completed)
  end

  # def submitted(timesheet_params, days, total_time)
  #   self.assign_attributes(timesheet_params)
  #   self.days = days
  #   self.total_time = total_time
  #   self.status = 'submitted'
  #   self.save
  #   con_cycle = ContractCycle.find(self.ts_cycle_id)
  #   # binding.pry
  #   con_cycle.update_attributes(completed_at: Time.now, status: "completed")
  #   con_cycle_ta_start_date = Timesheet.set_con_cycle_ta_date(con_cycle&.contract&.buy_contract, con_cycle)
  #   # binding.pry
  #   con_cycle_ta = ContractCycle.where(contract_id: con_cycle.contract_id,
  #                                       company_id: self.contract.sell_contract.company_id,
  #                                       note: "Timesheet Approve",
  #                                       cycle_type: "TimesheetApprove",
  #                                       next_action: "InvoiceGenerate"
  #   ).where("DATE(end_date) = ?", con_cycle_ta_start_date.end_of_day.to_date).first
  #   # binding.pry
  #   # unless con_cycle_ta
  #   #   con_cycle_ta = ContractCycle.create(contract_id: con_cycle.contract_id,
  #   #                                       start_date: con_cycle_ta_start_date,
  #   #                                       end_date: (con_cycle_ta_start_date.end_of_day),
  #   #                                       cyclable: self,
  #   #                                       company_id: self.contract.sell_contracts.first.company_id,
  #   #                                       note: "Timesheet Approve",
  #   #                                       cycle_date: Time.now,
  #   #                                       cycle_type: "TimesheetApprove",
  #   #                                       next_action: "InvoiceGenerate"
  #   #   )
  #   # end
  #   # con_cycle_ta.update_attributes(cycle_date: Time.now)
  #   # binding.pry
  #   self.update_attributes(ta_cycle_id: con_cycle_ta.id)
  # end

  def self.set_con_cycle_ta_date(buy_contract, con_cycle)
    @ta_type = buy_contract&.ts_approve
    @ta_day_of_week = if buy_contract&.ta_day_of_week.present?
                        Date.parse(buy_contract&.ta_day_of_week&.titleize).try(:strftime, '%A')
                      else
                        'mon'
                      end
    @ta_date_1 = buy_contract&.ta_date_1.try(:strftime, '%e')
    @ta_date_2 = buy_contract&.ta_date_2.try(:strftime, '%e')
    @ta_end_of_month = buy_contract&.ta_end_of_month
    @ta_day_time = buy_contract&.ta_day_time.try(:strftime, '%H:%M')
    con_cycle_ta_start_date = case @ta_type
                              when 'daily'
                                con_cycle.start_date
                              when 'weekly'
                                date_of_next(@ta_day_of_week, con_cycle)
                              when 'monthly'
                                if @ta_end_of_month
                                  DateTime.now.end_of_month
                                else
                                  montly_approval_date(con_cycle)
                                end
                              when 'twice a month'
                                twice_a_month_approval_date(con_cycle)
                              else
                                con_cycle.start_date
                              end
    con_cycle_ta_start_date
  end

  def self.date_of_next(day_of_week, con_cycle)
    day_of_week = DateTime.parse(day_of_week).wday
    ts_day_of_week = DateTime.parse(con_cycle&.contract&.buy_contract.ts_day_of_week).wday if con_cycle.contract.buy_contract.time_sheet == 'weekly'
    date = con_cycle.start_date.to_date + ((day_of_week - con_cycle.start_date.to_date.wday) % 7)
    if day_of_week >= con_cycle.start_date.wday
      date = (date - con_cycle.start_date.to_date <= 5) && con_cycle.start_date.wday != 0 ? date + 7.days : date
    else
      date
    end
    if ts_day_of_week.present? && ts_day_of_week > day_of_week
      date += 7.days
    else
      date
    end
  end

  def self.montly_approval_date(con_cycle)
    day = @ta_date_1&.to_i.present? ? @ta_date_1&.to_i : 0
    next_month_year = con_cycle.start_date.strftime('%d').to_i <= day ? con_cycle.start_date : (con_cycle.start_date + 1.month)
    month = next_month_year&.strftime('%m').to_i
    year = next_month_year&.strftime('%Y').to_i
    con_cycle_ta_start_date = DateTime.new(year, month, day)
  end

  def self.twice_a_month_approval_date(con_cycle)
    # binding.pry
    day_1 = @ta_date_1&.to_i
    day_2 = @ta_date_2&.to_i.present? ? @ta_date_2&.to_i : 0
    if con_cycle.start_date.strftime('%d').to_i <= day_1
      day = @ta_date_1&.to_i
      next_month_year = con_cycle.start_date
      month = next_month_year&.strftime('%m').to_i
      year = next_month_year&.strftime('%Y').to_i
    elsif con_cycle.start_date.strftime('%d').to_i > day_1 && con_cycle.start_date.strftime('%d').to_i <= day_2
      day = @ta_date_2&.to_i
      next_month_year = con_cycle.start_date
      month = next_month_year&.strftime('%m').to_i
      year = next_month_year&.strftime('%Y').to_i
    elsif con_cycle.start_date.strftime('%d').to_i > day_2 && !@ta_end_of_month
      day = @ta_date_1&.to_i
      next_month_year = con_cycle.start_date + 1.month
      month = next_month_year&.strftime('%m').to_i
      year = next_month_year&.strftime('%Y').to_i
    elsif @ta_end_of_month
      next_month_year = con_cycle.start_date.end_of_month
      day = next_month_year.strftime('%e').to_i
      month = next_month_year&.strftime('%m').to_i
      year = next_month_year&.strftime('%Y').to_i
    end
    con_cycle_ta_start_date = DateTime.new(year, month, day)
  end

  def set_ts_on_seq
    ledger = Sequence::Client.new(
      ledger_name: 'company-dev',
      credential: 'OUUY4ZFYQO4P3YNC5JC3GMY7ZQJCSNTH'
    )
    receiver = if contract.buy_contract.contract_type == 'C2C'
                 "vendor_#{contract.buy_contract.company_id}"
               else
                 "cons_#{contract.buy_contract.candidate.id}"
               end
    # self.contract.set_on_seq
    begin
      tx = ledger.transactions.transact do |builder|
        builder.issue(
          flavor_id: 'min',
          amount: (total_time.to_f * 60).to_i,
          destination_account_id: receiver,
          action_tags: {
            'Fixed' => 'false',
            'Status' => 'open',
            'Account' => '',
            'CycleId' => ts_cycle_id.to_s,
            'ObjType' => 'TS',
            'ContractId' => contract_id.to_s,
            'PostingDate' => Time.now.strftime('%m/%d/%Y'),
            'CycleFrom' => start_date.to_datetime + Time.parse('00:00').seconds_since_midnight.seconds,
            'CycleTo' => end_date.to_datetime + Time.parse('00:00').seconds_since_midnight.seconds,
            'Documentdate' => Time.now,
            'TransactionType' => contract.buy_contract.contract_type == 'C2C' ? 'C2C' : 'W2'
          }
        )
      end
    rescue Sequence::APIError => e
      action_error = JSON.parse(e.response.body)['data']['actions'][0]

      p action_error['message']

      p action_error['seq_code']

      p action_error['data']['index']
    end
  end

  def retire_on_reject_seq
    ledger = Sequence::Client.new(
      ledger_name: 'company-dev',
      credential: 'OUUY4ZFYQO4P3YNC5JC3GMY7ZQJCSNTH'
    )
    receiver = if contract.buy_contract.contract_type == 'C2C'
                 "vendor_#{contract.buy_contracts.company_id}"
               else
                 "cons_#{contract.buy_contracts.candidate.id}"
               end
    # self.contract.set_on_seq
    tx = ledger.transactions.transact do |builder|
      builder.retire(
        flavor_id: 'min',
        amount: (total_time.to_f * 60).to_i,
        source_account_id: receiver,
        action_tags: {
          'Fixed' => 'false',
          'Status' => 'open',
          'Account' => '',
          'CycleId' => ts_cycle_id.to_s,
          'ObjType' => 'TS',
          'ContractId' => contract_id.to_s,
          'PostingDate' => Time.now.strftime('%m/%d/%Y'),
          'CycleFrom' => start_date.to_datetime + Time.parse('00:00').seconds_since_midnight.seconds,
          'CycleTo' => end_date.to_datetime + Time.parse('00:00').seconds_since_midnight.seconds,
          'Documentdate' => Time.now.strftime('%m/%d/%Y'),
          'TransactionType' => contract.buy_contract.contract_type == 'C2C' ? 'C2C' : 'W2'
        }
      )
    end
  end

  def set_ta_on_seq
    ledger = Sequence::Client.new(
      ledger_name: 'company-dev',
      credential: 'OUUY4ZFYQO4P3YNC5JC3GMY7ZQJCSNTH'
    )
    receiver = if contract.buy_contract.contract_type == 'C2C'
                 "vendor_#{contract.buy_contract.company_id}"
               else
                 "cons_#{contract.buy_contract.candidate.id}"
               end
    # self.contract.set_on_seq
    tx = ledger.transactions.transact do |builder|
      builder.transfer(
        flavor_id: 'min',
        amount: (total_time.to_f * 60).to_i,
        source_account_id: receiver,
        destination_account_id: "comp_#{contract.company_id}_treasury",
        action_tags: {
          'Fixed' => 'false',
          'Status' => 'open',
          'Account' => '',
          'CycleId' => ta_cycle_id.to_s,
          'ObjType' => 'TA',
          'ContractId' => contract_id.to_s,
          'PostingDate' => Time.now.strftime('%m/%d/%Y'),
          'CycleFrom' => start_date.to_datetime + Time.parse('00:00').seconds_since_midnight.seconds,
          'CycleTo' => end_date.to_datetime + Time.parse('00:00').seconds_since_midnight.seconds,
          'Documentdate' => Time.now.strftime('%m/%d/%Y'),
          'TransactionType' => contract.buy_contract.contract_type == 'C2C' ? 'C2C' : 'W2'
        }
      )

      builder.issue(
        flavor_id: 'usd',
        amount: amount.to_i * 100,
        destination_account_id: receiver,
        action_tags: {
          'Fixed' => 'false',
          'Status' => 'open',
          'Account' => '',
          'CycleId' => ta_cycle_id.to_s,
          'ObjType' => 'TA',
          'ContractId' => contract_id.to_s,
          'PostingDate' => Time.now.strftime('%m/%d/%Y'),
          'CycleFrom' => start_date.to_datetime + Time.parse('00:00').seconds_since_midnight.seconds,
          'CycleTo' => end_date.to_datetime + Time.parse('00:00').seconds_since_midnight.seconds,
          'Documentdate' => Time.now.strftime('%m/%d/%Y'),
          'TransactionType' => contract.buy_contract.contract_type == 'C2C' ? 'C2C' : 'W2'
        }
      )
    end
  end
end
