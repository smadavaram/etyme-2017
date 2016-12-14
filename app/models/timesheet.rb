class Timesheet < ActiveRecord::Base

  #Enum
  enum status: [:open,:pending_review, :approved , :partially_approved , :rejected]

  #Associations
  belongs_to :company
  belongs_to :contract
  belongs_to :user
  belongs_to :job
  has_many   :timesheet_logs , dependent: :destroy
  has_many   :timesheet_approvers  , dependent: :destroy

  before_create :set_recurring_timesheet_cycle
  after_create  :create_timesheet_logs


  private
  # After create
  def create_timesheet_logs #this should be controlled via a cron job or using delay.
    self.start_date.upto(self.end_date) do |date|
      self.timesheet_logs.create(transaction_day: date)
    end
    self.delay(run_at: self.next_timesheet_created_date).schedule_timesheet if self.next_timesheet_created_date.present? && self.contract.is_not_ended?
  end

  # Call in delay Job
  def schedule_timesheet
    self.contract.timesheets.create(job_id: self.job.id ,start_date: self.end_date + 1.day , company_id: self.job.company.id , status: 'open')
  end

  # Before create
  def set_recurring_timesheet_cycle #correct variable names
    puts "_End Date:"
    puts _end_date  = self.start_date + TIMESHEET_FREQUENCY[self.contract.time_sheet_frequency].days - 1
    if  self.contract.end_date <= _end_date
      puts "Check true"
      self.next_timesheet_created_date = nil
      self.end_date                    = self.contract.end_date
    else
      puts "Check false"
      self.next_timesheet_created_date = _end_date - 1
      self.end_date                    = _end_date
    end
  end

end
