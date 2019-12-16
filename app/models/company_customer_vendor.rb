class CompanyCustomerVendor < ApplicationRecord
  enum file_type: [:customer, :vendor]
  belongs_to :company
end
