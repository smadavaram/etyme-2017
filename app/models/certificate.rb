# frozen_string_literal: true

# == Schema Information
#
# Table name: certificates
#
#  id           :bigint           not null, primary key
#  candidate_id :bigint
#  title        :string
#  institute    :string
#  start_date   :date
#  end_date     :date
#  created_at   :datetime         not null
#  updated_at   :datetime         not null
#
class Certificate < ActiveRecord::Base
  belongs_to :candidate
  has_many :candidate_certificate_documents

  accepts_nested_attributes_for :candidate_certificate_documents, reject_if: :all_blank, allow_destroy: true
end
