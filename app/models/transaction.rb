class Transaction < ActiveRecord::Base

  enum status: [:pending , :accepted , :rejected]

  # Callbacks
  before_validation         :set_time_date
  before_validation         :set_total_time

  # Validations
  validate                  :time_overlap
  validate                  :start_time_less_than_end_time
  validate                  :end_time_is_not_in_future
  validate                  :max_hours_limit
  validate                  :timesheet_open

  # Relationships
  belongs_to                :timesheet_log
  has_one                   :timesheet, through: :timesheet_log

  # Scopes
  default_scope             -> {order(created_at: :desc)}
  scope :pending,           -> {where(status: 0)}
  scope :accepted,          -> {where(status: 1)}
  scope :rejected,          -> {where(status: 2)}
  scope :not_rejected,      -> {where.not(status: 2)}

  private

  def timesheet_open
    if !(self.timesheet.open?)
      errors.add(:base,"Timesheet is closed!")
    end
  end

  def max_hours_limit
    if self.total_time+self.timesheet_log.total_time > self.timesheet.user.max_working_hours
      errors.add(:base,"Max Working Hour limit reached!")
    end
  end

  def end_time_is_not_in_future
    if self.end_time > DateTime.now
      errors.add(:base,'Time can not be in future!')
    end
  end

  def start_time_less_than_end_time
    if self.start_time >= self.end_time
      errors.add(:base,"Start time should be less than end time!")
    end
  end

  def time_overlap
    if check_dates_overlap?
      errors.add(:base,'The time you entered overlaps with an earlier entry!')
    end

  end

  def set_total_time
    if start_time.present? && end_time.present?
      self.total_time= ((end_time - start_time)).to_i
    end
  end

  def set_time_date
    self.start_time=DateTime.new(self.timesheet_log.transaction_day.year,self.timesheet_log.transaction_day.month,self.timesheet_log.transaction_day.day,self.start_time.hour,self.start_time.min,self.start_time.sec,self.start_time.zone)
    self.end_time=DateTime.new(self.timesheet_log.transaction_day.year,self.timesheet_log.transaction_day.month,self.timesheet_log.transaction_day.day,self.end_time.hour,self.end_time.min,self.end_time.sec,self.end_time.zone);
  end


  def check_dates_overlap?
    self.timesheet_log.transactions.not_rejected.all.each do |t|
      if self.start_time.between?(t.start_time,t.end_time)
        return true
      elsif  self.end_time.between?(t.start_time,t.end_time)
        return true
      end #end of if
    end #end of each
    return false
  end


end
