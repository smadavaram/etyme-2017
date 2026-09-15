# frozen_string_literal: true

# == Schema Information
#
# Table name: interviews
#
#  id                    :bigint           not null, primary key
#  date                  :string
#  time                  :string
#  job_application_id    :bigint
#  source                :string
#  location              :string
#  accept                :boolean          default(FALSE)
#  accepted_by_recruiter :boolean          default(FALSE)
#  accepted_by_company   :boolean          default(FALSE)
#
class Interview < ApplicationRecord
  belongs_to :job_application

  def is_accepted?
    if job_application.recruiter_company_id.blank?
      accept && accepted_by_company
    else
      accept && accepted_by_recruiter && accepted_by_company
    end
  end
end
