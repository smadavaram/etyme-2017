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
require 'test_helper'

class CompanyCustomerVendorTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
