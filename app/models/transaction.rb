class Transaction < ActiveRecord::Base

  enum status: [:pending , :accepted , :rejected]

  attr_accessor :timesheet_log_date

  belongs_to :timesheet_log
  has_one :timesheet, through: :timesheet_log

  scope :pending, -> {where(status: 'pending')}
end
