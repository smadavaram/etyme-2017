class TimesheetLog < ActiveRecord::Base

  enum status: [:pending , :approved , :partially_approved , :rejected]

  belongs_to :timesheet
  has_many   :transactions
  has_one    :company , through: :timesheet
  has_one    :contract , through: :timesheet

  after_create :schedule_timesheet_log

  validates           :transaction_day,  presence:   true


  def total_time
    logged_time = 0
    self.transactions.each do |transaction|
      logged_time = logged_time + transaction.total_time
    end
    logged_time
  end

  private

  def set_recurring_log_cycle
    self.timesheet.timesheet_logs.create(transaction_day: Date.today)
  end

  def schedule_timesheet_log
    self.delay(run_at: self.transaction_day + 1.day).set_recurring_log_cycle if self.contract.is_not_ended? && self.transaction_day < self.timesheet.end_date
  end

end
