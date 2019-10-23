class SalaryItem < ApplicationRecord
  belongs_to :salary
  belongs_to :salaryable, polymorphic: true
  after_create :update_salary_timesheet, if: Proc.new { |s| s.salaryable.class.to_s == "Timesheet" }
  after_create :update_salary_expenses, if: Proc.new { |s| s.salaryable.class.to_s == "Expense" }
  scope :expenses, -> {where(salaryable_type: "Expense")}
  def update_salary_timesheet
    if (salaryable.salaried!)
      salary.update_attributes(total_amount: salary.total_amount + salaryable.amount,
                               total_approve_time: salary.total_approve_time + salaryable.total_time,
                               status: :open
      )
    end
  end
  
  def update_salary_expenses
    salaryable.salaried!
  end

end