# frozen_string_literal: true

# == Schema Information
#
# Table name: clients
#
#  id                              :bigint           not null, primary key
#  candidate_id                    :bigint
#  name                            :string
#  industry                        :string
#  start_date                      :date
#  end_date                        :date
#  project_description             :string
#  role                            :string
#  refrence_name                   :string
#  refrence_phone                  :string
#  refrence_email                  :string
#  created_at                      :datetime         not null
#  updated_at                      :datetime         not null
#  refrence_two_name               :string
#  refrence_two_email              :string
#  refrence_two_phone              :string
#  refrence_one                    :boolean
#  refrence_two                    :boolean
#  slug_one                        :string
#  slug_two                        :string
#  refrence_phone_country_code     :string
#  refrence_two_phone_country_code :string
#
class Client < ActiveRecord::Base
  belongs_to :candidate
  has_one :designation, dependent: :destroy
  has_many :portfolios, as: :portfolioable, dependent: :destroy

  # TODO: Not working. Clue: Slugs should be generated in a a before and the emai in an after
  # before_save :send_reference_mail

  accepts_nested_attributes_for :designation, reject_if: :all_blank, allow_destroy: true
  accepts_nested_attributes_for :portfolios, reject_if: :all_blank, allow_destroy: true

  def formatted_date
    [start_date&.strftime('%B-%Y'), end_date&.strftime('%B-%Y')].join("-")
  end

  def send_reference_mail
    if !refrence_one.present? && refrence_email_changed?
      self.slug_one = SecureRandom.hex(5)
      Candidate::CandidateMailer.client_reference(refrence_email, candidate.full_name, id, slug_one).deliver!
    end
    if !refrence_two.present? && refrence_two_email_changed?
      self.slug_two = SecureRandom.hex(6)
      Candidate::CandidateMailer.client_reference(refrence_two_email, candidate.full_name, id, slug_two).deliver!
    end
  end
end
