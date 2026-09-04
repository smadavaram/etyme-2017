# frozen_string_literal: true

# == Schema Information
#
# Table name: transactions
#
#  id           :integer          not null, primary key
#  timesheet_id :integer
#  start_time   :datetime
#  end_time     :datetime
#  total_time   :integer          default(0)
#  status       :integer          default("pending")
#  memo         :text
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#  file         :string
#
class Transaction < ApplicationRecord
  enum status: %i[pending accepted rejected]

  # before_validation   :set_time_date
  # before_validation   :set_total_time

  # validate             :time_overlap
  # validate             :start_time_less_than_end_time
  # validate             :end_time_is_not_in_future
  # validate             :max_hours_limit , on: :create
  # validate             :timesheet_open
  # validate             :time_overlap , on: [:create]
  # validate             :start_time_less_than_end_time
  # validate             :end_time_is_not_in_future

  belongs_to :timesheet
  # has_one              :timesheet, through: :timesheet_log
  # has_one              :contract , through: :timesheet

  default_scope -> { order(created_at: :desc) }
  scope :not_rejected, -> { where.not(status: :rejected) }

  def hour
    total_time.nil? ? 0.0 : total_time / 3600.0
  end

  private

  def timesheet_open
    errors.add(:base, 'Timesheet is closed!') unless timesheet.open?
  end

  def max_hours_limit
    errors.add(:base, 'Max Working Hour limit reached!') if (total_time + timesheet_log.total_time) > timesheet.user.max_working_hours
  end

  def end_time_is_not_in_future
    errors.add(:base, 'Time can not be in future!') if end_time > DateTime.now
  end

  def start_time_less_than_end_time
    errors.add(:base, 'Start time should be less than end time!') if start_time >= end_time
  end

  def time_overlap
    errors.add(:base, 'The time you entered overlaps with an earlier entry!') if check_dates_overlap?
  end

  def set_total_time
    self.total_time = ((end_time - start_time)).to_i if start_time.present? && end_time.present?
  end

  def set_time_date
    self.start_time = DateTime.new(timesheet_log.transaction_day.year, timesheet_log.transaction_day.month, timesheet_log.transaction_day.day, start_time.hour, start_time.min, start_time.sec, DateTime.now.zone)
    self.end_time = DateTime.new(timesheet_log.transaction_day.year, timesheet_log.transaction_day.month, timesheet_log.transaction_day.day, end_time.hour, end_time.min, end_time.sec, DateTime.now.zone)
  end

  def check_dates_overlap?
    timesheet_log.transactions.not_rejected.all.each do |t|
      if start_time.between?(t.start_time, t.end_time)
        return true
      elsif end_time.between?(t.start_time, t.end_time)
        return true
      end
    end
    false
  end
end
