# frozen_string_literal: true

# == Schema Information
#
# Table name: invited_companies
#
#  id                    :integer          not null, primary key
#  user_id               :integer
#  invited_company_id    :integer
#  invited_by_company_id :integer
#  created_at            :datetime         not null
#  updated_at            :datetime         not null
#
require 'test_helper'

class InvitedCompanyTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
