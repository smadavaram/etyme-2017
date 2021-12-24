# frozen_string_literal: true

# == Schema Information
#
# Table name: prefer_vendors
#
#  id         :integer          not null, primary key
#  company_id :integer
#  vendor_id  :integer
#  status     :integer          default("pending")
#  created_at :datetime         not null
#  updated_at :datetime         not null
#
require 'test_helper'

class PreferVendorTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
