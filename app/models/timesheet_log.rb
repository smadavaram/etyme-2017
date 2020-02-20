# frozen_string_literal: true

class TimesheetLog < ApplicationRecord
  enum status: %i[pending approved partially_approved rejected]

  belongs_to :timesheet, optional: true
  has_many   :transactions, dependent: :destroy
  belongs_to :contract_term, optional: true
  has_one    :company, through: :timesheet
  has_one    :contract, through: :timesheet
  has_one    :invoice, through: :timesheet

  after_update :update_pending_transaction, if: proc { |t| t.status_changed? && t.approved? }
  after_create :schedule_timesheet_log
  before_create :set_contract_term_id

  validates :transaction_day, presence: true
  validates :status, inclusion: { in: statuses.keys }

  def total_time
    transactions.sum(:total_time)
  end

  # def total_amount
  #   self.approved? ? self.accepted_hours * self.contract_term.rate : 0.0
  # end

  # def rate
  #   self.contract_term.rate
  # end

  def accepted_total_time
    transactions.accepted.sum(:total_time)
  end

  def accepted_hours
    accepted_total_time / 3600.0
  end

  private

  def set_recurring_log_cycle
    timesheet.timesheet_logs.create(transaction_day: Date.today)
  end

  def schedule_timesheet_log
    delay(run_at: transaction_day + 1.day).set_recurring_log_cycle if contract.is_not_ended? && transaction_day < timesheet.end_date
  end

  def update_pending_transaction
    transactions.pending.update_all(status: 1)
  end

  def set_contract_term_id
    # self.contract_term_id = self.contract.contract_terms.active.first.id
  end
end
