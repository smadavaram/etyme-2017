# frozen_string_literal: true

# == Schema Information
#
# Table name: contract_terms
#
#  id              :integer          not null, primary key
#  rate            :decimal(, )
#  note            :text
#  terms_condition :text
#  created_by      :integer
#  status          :integer          default("active")
#  contract_id     :integer
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#
require 'test_helper'

class ContractTermTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
