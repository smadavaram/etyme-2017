# frozen_string_literal: true

class CompanyCustomerVendor < ApplicationRecord
  enum file_type: %i[customer vendor]
  belongs_to :company
end
