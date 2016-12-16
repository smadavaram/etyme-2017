class Timesheet < ActiveRecord::Base

  enum status: [:open,:pending_review, :approved , :partially_approved , :rejected]

  belongs_to :company
  belongs_to :contract
  belongs_to :user
  belongs_to :job
  has_many   :timesheet_logs , dependent: :destroy
  has_many   :timesheet_approvers  , dependent: :destroy

  before_validation :set_recurring_timesheet_cycle
  after_create  :create_timesheet_logs
  after_update :update_pending_timesheet_logs, if: Proc.new{|t| t.status_changed? && t.approved?}

  validates           :start_date,  presence:   true
  validates           :end_date,    presence:   true

  def total_time
    total_time = 0
    self.timesheet_logs.each do |t|
      total_time = total_time + t.total_time
    end
    total_time
  end
  def approved_total_time
    total_time = 0
    self.timesheet_logs.approved.each do |t|
      total_time = total_time + t.accepted_total_time
    end
    total_time
  end

  def title
    self.job.title + " Job - Contract # " + self.contract.id.to_s
  end


  private
  def create_timesheet_logs
      self.timesheet_logs.create(transaction_day: start_date)
      self.delay(run_at: self.next_timesheet_created_date).schedule_timesheet if self.next_timesheet_created_date.present? && self.contract.is_not_ended?
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

end
