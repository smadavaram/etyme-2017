class Transaction < ActiveRecord::Base

  enum status: [:pending , :accepted , :rejected]

  attr_accessor :timesheet_log_date
  before_save   :set_time_date
  before_save   :set_total_time

  belongs_to :timesheet_log
  has_one :timesheet, through: :timesheet_log

  default_scope  -> {order(created_at: :desc)}
  scope :pending, -> {where(status: 'pending')}
  scope :accepted, -> {where(status: 1)}

  def set_total_time
    if start_time.present? && end_time.present?
      diff = ((end_time - start_time))
      self.total_time = diff > 0 ? diff : 0
    end
  end

  private
  
  def set_time_date
    self.start_time=DateTime.new(self.timesheet_log.transaction_day.year,self.timesheet_log.transaction_day.month,self.timesheet_log.transaction_day.day,self.start_time.hour,self.start_time.min,self.start_time.sec,self.start_time.zone)
    self.end_time=DateTime.new(self.timesheet_log.transaction_day.year,self.timesheet_log.transaction_day.month,self.timesheet_log.transaction_day.day,self.end_time.hour,self.end_time.min,self.end_time.sec,self.end_time.zone);
  end


end
