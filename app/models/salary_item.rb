# frozen_string_literal: true

class SalaryItem < ApplicationRecord
  belongs_to :salary
  belongs_to :salaryable, polymorphic: true
  after_create :update_salary_timesheet, if: proc { |s| s.salaryable.class.to_s == 'Timesheet' }
  after_create :update_salary_expenses, if: proc { |s| s.salaryable.class.to_s == 'Expense' }
  scope :expenses, -> { where(salaryable_type: 'Expense') }

  def update_salary_timesheet
    return unless salaryable.salaried!

    salary.update_attributes(approved_amount: salary.approved_amount.to_f + salaryable.amount.to_f,
                             total_approve_time: salary.total_approve_time + salaryable.total_time.to_f,
                             status: :open)
  end

  def update_salary_expenses
    salaryable.salaried!
  end
end
