class PayrollInfo < ApplicationRecord
  belongs_to :company
  has_many :contract_cycles, as: :cycle_of
  validates_presence_of :title

  has_many :tax_infos
  has_many :buy_contracts

  enum week_payroll_term: {"1 Day"=>1, "1 Days"=>2, "3 Days"=>3, "4 Days"=>4, "5 Days"=>5, "6 Days"=>6, "7 Days"=>7, "14 Days"=>14}
  enum month_payroll_term: {'End of current month' => 0, 'End of 1 previous month' => 1, 'End of 2 previous month' => 2}

  accepts_nested_attributes_for :tax_infos ,   allow_destroy: true, reject_if: :all_blank

end
