# frozen_string_literal: true

# == Schema Information
#
# Table name: bank_details
#
#  id                       :bigint           not null, primary key
#  company_id               :bigint
#  bank_name                :integer
#  balance                  :decimal(, )
#  new_balance              :decimal(, )
#  recon_date               :date
#  unidentified_bal         :decimal(, )
#  current_unidentified_bal :decimal(, )
#  created_at               :datetime         not null
#  updated_at               :datetime         not null
#
require 'test_helper'

class BankDetailTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
