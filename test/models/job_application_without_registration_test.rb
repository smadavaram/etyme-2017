# frozen_string_literal: true

# == Schema Information
#
# Table name: job_application_without_registrations
#
#  id                 :bigint           not null, primary key
#  first_name         :string
#  last_name          :string
#  email              :string
#  phone              :string
#  location           :string
#  skill              :string
#  visa               :string
#  title              :string
#  roal               :string
#  resume             :string
#  job_application_id :integer
#  is_registerd       :boolean
#  created_at         :datetime         not null
#  updated_at         :datetime         not null
#
require 'test_helper'

class JobApplicationWithoutRegistrationTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
