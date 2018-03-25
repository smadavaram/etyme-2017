class CompanyDepartment < ActiveRecord::Base
  belongs_to  :company
  belongs_to  :department

  accepts_nested_attributes_for :department ,   allow_destroy: true, reject_if: :all_blank

end