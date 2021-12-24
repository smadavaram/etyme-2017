# frozen_string_literal: true

# == Schema Information
#
# Table name: candidates
#
#  id                         :integer          not null, primary key
#  first_name                 :string           default("")
#  last_name                  :string           default("")
#  gender                     :integer
#  email                      :string           default(""), not null
#  phone                      :string
#  time_zone                  :string
#  primary_address_id         :integer
#  photo                      :string
#  signature                  :json
#  status                     :integer          default("signup")
#  dob                        :date
#  encrypted_password         :string           default(""), not null
#  reset_password_token       :string
#  reset_password_sent_at     :datetime
#  remember_created_at        :datetime
#  sign_in_count              :integer          default(0), not null
#  current_sign_in_at         :datetime
#  last_sign_in_at            :datetime
#  current_sign_in_ip         :string
#  last_sign_in_ip            :string
#  confirmation_token         :string
#  confirmed_at               :datetime
#  confirmation_sent_at       :datetime
#  unconfirmed_email          :string
#  created_at                 :datetime         not null
#  updated_at                 :datetime         not null
#  invitation_token           :string
#  invitation_created_at      :datetime
#  invitation_sent_at         :datetime
#  invitation_accepted_at     :datetime
#  invitation_limit           :integer
#  invited_by_type            :string
#  invited_by_id              :integer
#  invitations_count          :integer          default(0)
#  resume                     :string
#  skills                     :string
#  description                :string
#  visa                       :integer
#  location                   :string
#  video                      :string
#  category                   :string
#  subcategory                :string
#  dept_name                  :string
#  industry_name              :string
#  video_type                 :string
#  chat_status                :string
#  is_number_verify           :boolean          default(FALSE)
#  is_personal_info_update    :boolean          default(FALSE)
#  is_social_media            :boolean          default(FALSE)
#  is_education_detail_update :boolean          default(FALSE)
#  is_skill_update            :boolean          default(FALSE)
#  is_client_info_update      :boolean          default(FALSE)
#  is_designate_update        :boolean          default(FALSE)
#  is_documents_submit        :boolean          default(FALSE)
#  is_profile_active          :boolean          default(FALSE)
#  selected_from_resume       :string
#  ever_worked_with_company   :string
#  designation_status         :string
#  candidate_visa             :string
#  candidate_title            :string
#  candidate_roal             :string
#  facebook_url               :string
#  twitter_url                :string
#  linkedin_url               :string
#  skypeid                    :string
#  gtalk_url                  :string
#  address                    :string
#  company_id                 :bigint
#  passport_number            :string
#  ssn                        :string
#  relocation                 :boolean          default(FALSE)
#  work_authorization         :string
#  visa_type                  :string
#  latitude                   :float
#  longitude                  :float
#  recruiter_id               :integer
#  phone_country_code         :string
#  provider                   :string
#  uid                        :string
#  online_candidate_status    :string
#
require 'test_helper'

class CandidateTest < ActiveSupport::TestCase
  # test "the truth" do
  #   assert true
  # end
end
