# frozen_string_literal: true

# == Schema Information
#
# Table name: designations
#
#  id                           :bigint           not null, primary key
#  candidate_id                 :bigint
#  comp_name                    :string
#  recruiter_name               :string
#  recruiter_phone              :string
#  recruiter_email              :string
#  status                       :string
#  created_at                   :datetime         not null
#  updated_at                   :datetime         not null
#  company_role                 :string
#  start_date                   :date
#  end_date                     :date
#  confirmation                 :integer          default("unverified")
#  client_id                    :bigint
#  recruiter_phone_country_code :string
#
class Designation < ActiveRecord::Base
  delegate :url_helpers, to: 'Rails.application.routes'
  after_create :notify_recruiter
  scope :with_no_client,-> { where(client_id: nil) }

  belongs_to :candidate
  has_many :designation_projects, dependent: :destroy
  belongs_to :client, optional: true
  has_many :portfolios, as: :portfolioable, dependent: :destroy
  has_many :client_references, dependent: :destroy


  enum confirmation: %i[unverified verified notified not_found]

  accepts_nested_attributes_for :client_references, allow_destroy: true
  accepts_nested_attributes_for :designation_projects, allow_destroy: true
  accepts_nested_attributes_for :portfolios, reject_if: :all_blank, allow_destroy: true

  def formatted_date
    [start_date&.strftime('%B-%Y'), end_date&.strftime('%B-%Y')].join("-")
  end

  def notify_recruiter
    recruiter = User.find_by_email(recruiter_email)
    message = "Candidate #{candidate.email} has registered you as recruiter. If you want to accept <a href='#{url_helpers.accept_candidate_designation_url(id)}'>Click Here</a>."
    if recruiter
      recruiter_notification = recruiter.notifications.new(notification_type: 'invitation', createable: candidate, message: message, title: 'Invitation for Recruiter')
      notified! if recruiter_notification.save
    else
      not_found!
    end
  end
end
