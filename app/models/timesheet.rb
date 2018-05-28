class Timesheet < ApplicationRecord

  include Rails.application.routes.url_helpers

  # enum status: [:open,:pending_review, :approved , :partially_approved , :rejected , :submitted , :invoiced]
  enum status: [:open, :submitted, :approved , :partially_approved, :rejected, :invoiced]

  belongs_to :company, optional: true
  belongs_to :contract, optional: true
  belongs_to :user, optional: true
  belongs_to :job, optional: true
  belongs_to :invoice, optional: true
  belongs_to :candidate, optional: true
  has_many   :timesheet_logs , dependent: :destroy
  has_many   :timesheet_approvers  , dependent: :destroy
  has_many   :transactions  , through: :timesheet_logs

  has_many :contract_salary_histories ,as: :salable, dependent: :destroy


  belongs_to :ts_cycle, optional: true, foreign_key: :ts_cycle_id, class_name: 'ContractCycle'
  belongs_to :ta_cycle, optional: true, foreign_key: :ta_cycle_id, class_name: 'ContractCycle'

  # before_validation :set_recurring_timesheet_cycle
  after_update  :set_ts_on_seq, if: Proc.new{|t| t.status_changed? && t.submitted? && t.total_time.to_f > 0}
  after_update  :set_ta_on_seq, if: Proc.new{|t| t.status_changed? && t.approved? && t.total_time.to_f > 0}

  # after_create  :create_timesheet_logs
  # after_create  :notify_timesheet_created
  # after_update :update_pending_timesheet_logs, if: Proc.new{|t| t.status_changed? && t.approved?}

  after_update :set_contract_salary_histories, if: Proc.new{|t| t.status_changed? && t.approved?}

  validates           :start_date,  presence:   true
  validates           :end_date,    presence:   true
  validates :status , inclusion: {in: statuses.keys}
  
  validates_uniqueness_of :start_date, scope: :contract_id, :message => "Timesheet already submitted."
  

  scope :not_invoiced, -> {where(invoice_id: nil)}
  scope :open_timesheets, -> {where(status: :open)}
  scope :submitted_timesheets, -> {where(status: :submitted)}
  scope :approved_timesheets, -> {where(status: :approved)}

  def assignee
    self.contract.assignee
  end

  def self.find_sent_or_received(timesheet_id , obj)
    joins(:job).where("timesheets.id = :t_id and (timesheets.company_id = :obj_id or (jobs.company_id = :obj_id))" , {obj_id: obj.id , t_id: timesheet_id}).first
  end

  def is_already_submitted?(user)
    self.timesheet_approvers.where('timesheet_approvers.user_id = ? AND (timesheet_approvers.status = ?)' , user.id , Timesheet.statuses[:submitted]).present?
  end

  def is_already_approved_or_rejected?(user)
    self.timesheet_approvers.where('timesheet_approvers.user_id = ? AND (timesheet_approvers.status = ? OR timesheet_approvers.status = ?)' , user.id , Timesheet.statuses[:approved] , Timesheet.statuses[:rejected]).present?
  end

  def total_time
    super
    # total_time = 0
    # self.timesheet_logs.each do |t| total_time = total_time + t.total_time end
    # total_time
  end

  def approved_total_time
    total_time = 0.0
    self.timesheet_logs.approved.each do |t| total_time = total_time + t.accepted_total_time end
    total_time
  end

  def notify_timesheet_created
    self.contract.assignee.notifications.create(message: self.contract.assignee.full_name+" your timesheet for the <a href='http://#{self.contract.assignee.etyme_url + contract_path(self.contract)}'>#{self.contract.job.title}</a> has been created <a href='http://#{self.contract.assignee.etyme_url + timesheet_timesheet_log_path(self , self.timesheet_logs.last)}'>  Click here </a> to start logging time accordingly " ,title: "Timesheet")
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
    title = ""
    self.timesheet_approvers.each do |aa|
      title = title + aa.status_by
    end
    title
  end


  # private
  def create_timesheet_logs
    self.timesheet_logs.create(transaction_day: start_date)
    self.delay(run_at: self.next_timesheet_created_date).schedule_timesheet if self.next_timesheet_created_date.present? && self.contract.is_not_ended?
      # self.schedule_timesheet if self.next_timesheet_created_date.present? && self.contract.is_not_ended?
  end

  def schedule_timesheet
    self.contract.timesheets.create(user_id: self.user_id , job_id: self.job.id ,start_date: self.end_date + 1.day , company_id: self.company_id , status: 'open')
    self.pending_review!
  end

  def set_recurring_timesheet_cycle
    temp_date  = self.start_date + TIMESHEET_FREQUENCY[self.contract.time_sheet_frequency].days - 1
    if  self.contract.end_date <= temp_date
      self.next_timesheet_created_date = nil
      self.end_date                    = self.contract.end_date
    else
      self.next_timesheet_created_date = temp_date - 1
      self.end_date                    = temp_date
    end
  end

  def update_pending_timesheet_logs
    self.timesheet_logs.pending.each do |timesheet_log|
      timesheet_log.approved!
    end
  end

  def contract_id=(new_contract_id)
    write_attribute(:contract_id, new_contract_id)
    con = Contract.find(new_contract_id)
    self.job_id = con.job_id
    self.company_id = con.company_id
  end

  def set_contract_salary_histories
    amoount = (self.total_time * self.contract.buy_contracts.first.payrate)
    contract_amount = self.contract.salary_to_pay
    ContractSalaryHistory.create(contract_id: self.contract_id,
                                 company_id: self.contract.company_id,
                                 candidate_id: self.contract.buy_contracts.first.candidate_id,
                                 salary_type: "CREDIT",
                                 description: "Timesheet Approved",
                                 amount: amoount,
                                 final_amount: (contract_amount + amoount),
                                 salable: self
    )

    self.contract.update(salary_to_pay: (contract_amount + amoount))
  end

  def get_total_amount
    self.total_time * self.contract.buy_contracts.first.payrate
  end

  def submitted(timesheet_params, days, total_time)
    self.assign_attributes(timesheet_params)
    self.days = days
    self.total_time = total_time
    self.status = 'submitted'
    self.save
    con_cycle = ContractCycle.find(self.ts_cycle_id)
    con_cycle.update_attributes(completed_at: Time.now, status: "completed")

    con_cycle_ta = ContractCycle.create(contract_id: con_cycle.contract_id,
                                        start_date: con_cycle.start_date,
                                        end_date: con_cycle.end_date,
                                        cyclable: self,
                                        company_id: self.contract.sell_contracts.first.company_id,
                                        note: "Timesheet Approve",
                                        cycle_date: Time.now,
                                        cycle_type: "TimesheetApprove",
                                        next_action: "InvoiceGenerate"
    )
    self.update_attributes(ta_cycle_id: con_cycle_ta.id)
  end

  def set_ts_on_seq
    ledger = Sequence::Client.new(
        ledger_name: ENV['seq_ledgers'],
        credential: ENV['seq_token']
    )

    tx = ledger.transactions.transact do |builder|
      builder.issue(
          flavor_id: 'min',
          amount: (self.total_time.to_f * 60).to_i,
          destination_account_id: "#{self.contract.buy_contracts.first.candidate.full_name.parameterize + self.contract.buy_contracts.first.candidate.id.to_s}_q",
          action_tags: {
            "Fixed" => "false",
            "Status" => "open",
            "Account" => "",
            "CycleId" => self.ts_cycle_id.to_s,
            "ObjType" => "TS",
            "ContractId" => self.contract_id.to_s,
            "PostingDate" => Time.now.strftime("%m/%d/%Y"),
            "CycleFrom" => self.start_date.strftime("%m/%d/%Y"),
            "CycleTo" => self.end_date.strftime("%m/%d/%Y"),
            "Documentdate" => Time.now.strftime("%m/%d/%Y"),
            "TransactionType" => self.contract.buy_contracts.first.contract_type == "C2C" ? "C2C" : "W2"
          },
      )
    end
  end

  def set_ta_on_seq
    ledger = Sequence::Client.new(
        ledger_name: ENV['seq_ledgers'],
        credential: ENV['seq_token']
    )

    tx = ledger.transactions.transact do |builder|
      builder.transfer(
          flavor_id: 'min',
          amount: (self.total_time.to_f * 60).to_i,
          destination_account_id: "#{self.contract.sell_contracts.first.company.slug.to_s + self.contract.sell_contracts.first.company.id.to_s}_q",
          source_account_id: "#{self.contract.buy_contracts.first.candidate.full_name.parameterize + self.contract.buy_contracts.first.candidate.id.to_s}_q",
          action_tags: {
              "Fixed" => "false",
              "Status" => "open",
              "Account" => "",
              "CycleId" => self.ta_cycle_id.to_s,
              "ObjType" => "TA",
              "ContractId" => self.contract_id.to_s,
              "PostingDate" => Time.now.strftime("%m/%d/%Y"),
              "CycleFrom" => self.start_date.strftime("%m/%d/%Y"),
              "CycleTo" => self.end_date.strftime("%m/%d/%Y"),
              "Documentdate" => Time.now.strftime("%m/%d/%Y"),
              "TransactionType" => self.contract.buy_contracts.first.contract_type == "C2C" ? "C2C" : "W2"
          },
      )

      builder.issue(
          flavor_id: 'tym',
          amount: get_total_amount.to_i * 100,
          destination_account_id: "#{self.contract.buy_contracts.first.candidate.full_name.parameterize + self.contract.buy_contracts.first.candidate.id.to_s}_q",
          action_tags: {
              "Fixed" => "false",
              "Status" => "open",
              "Account" => "",
              "CycleId" => self.ta_cycle_id.to_s,
              "ObjType" => "TA",
              "ContractId" => self.contract_id.to_s,
              "PostingDate" => Time.now.strftime("%m/%d/%Y"),
              "CycleFrom" => self.start_date.strftime("%m/%d/%Y"),
              "CycleTo" => self.end_date.strftime("%m/%d/%Y"),
              "Documentdate" => Time.now.strftime("%m/%d/%Y"),
              "TransactionType" => self.contract.buy_contracts.first.contract_type == "C2C" ? "C2C" : "W2"
          },
      )
    end
  end

end
