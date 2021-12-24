# frozen_string_literal: true

# == Schema Information
#
# Table name: vendor_bills
#
#  id              :bigint           not null, primary key
#  vb_cal_cycle_id :integer
#  vp_pro_cycle_id :integer
#  vb_clr_cycle_id :integer
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#
require 'test_helper'

class VendorBillTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
