# frozen_string_literal: true

# == Schema Information
#
# Table name: company_customer_vendors
#
#  id         :bigint           not null, primary key
#  company_id :bigint
#  file       :string
#  file_type  :integer
#  created_at :datetime         not null
#  updated_at :datetime         not null
#
class CompanyCustomerVendor < ApplicationRecord
  enum file_type: %i[customer vendor]
  belongs_to :company
end
