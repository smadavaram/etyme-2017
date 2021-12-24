# frozen_string_literal: true

# == Schema Information
#
# Table name: candidates_companies
#
#  candidate_id     :integer
#  company_id       :integer
#  status           :integer          default("normal")
#  candidate_status :integer          default(0)
#  id               :bigint           not null, primary key
#  created_at       :datetime         default(Sat, 18 Dec 2021 23:29:01 UTC +00:00)
#  updated_at       :datetime         default(Sat, 18 Dec 2021 23:29:01 UTC +00:00)
#
require 'test_helper'

class CandidatesCompanyTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
