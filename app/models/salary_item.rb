class SalaryItem < ApplicationRecord
  belongs_to :salary
  belongs_to :salaryable, polymorphic: true
end