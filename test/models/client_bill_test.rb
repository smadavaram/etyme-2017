# frozen_string_literal: true

# == Schema Information
#
# Table name: client_bills
#
#  id              :bigint           not null, primary key
#  cb_cal_cycle_id :integer
#  cp_pro_cycle_id :integer
#  cb_clr_cycle_id :integer
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#
require 'test_helper'

class ClientBillTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
