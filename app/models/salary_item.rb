class SalaryItem < ApplicationRecord
  belongs_to :salary
  belongs_to :salaryable, polymorphic: true
  after_create :update_timesheet, if: Proc.new { |s| s.salaryable.class.to_s == "Timesheet" }
  
  def update_timesheet
    if (salaryable.salaried!)
      salary.update_attributes(total_amount: salary.total_amount + salaryable.amount,
                               total_approve_time: salary.total_approve_time + salaryable.total_time,
                               status: :open
      )
    end
  end

end