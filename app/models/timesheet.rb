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

  validates           :start_date,  presence:   true
  validates           :end_date,    presence:   true


  def total_time
    total_logged_time=0
    self.timesheet_logs.each do |tsl|
      total_logged_time=total_logged_time +ts.total_time
    end
  end

  private
  def create_timesheet_logs
      self.timesheet_logs.create(transaction_day: start_date)
      self.delay(run_at: self.next_timesheet_created_date).schedule_timesheet if self.next_timesheet_created_date.present? && self.contract.is_not_ended?
  end

  def schedule_timesheet
    self.contract.timesheets.create(job_id: self.job.id ,start_date: self.end_date + 1.day , company_id: self.job.company.id , status: 'open')
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

end
