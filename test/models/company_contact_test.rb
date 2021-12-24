# frozen_string_literal: true

# == Schema Information
#
# Table name: company_contacts
#
#  id              :integer          not null, primary key
#  company_id      :integer
#  first_name      :string
#  last_name       :string
#  email           :string           default(""), not null
#  phone           :string
#  status          :integer
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#  title           :string
#  photo           :string
#  department      :string
#  user_id         :bigint
#  user_company_id :bigint
#  created_by_id   :bigint
#
require 'test_helper'

class CompanyContactTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
