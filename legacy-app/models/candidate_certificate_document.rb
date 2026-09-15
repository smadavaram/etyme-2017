# frozen_string_literal: true

# == Schema Information
#
# Table name: candidate_certificate_documents
#
#  id             :bigint           not null, primary key
#  certificate_id :integer
#  title          :string
#  file           :string
#  exp_date       :date
#  created_at     :datetime         not null
#  updated_at     :datetime         not null
#
class CandidateCertificateDocument < ApplicationRecord
  belongs_to :certificate
end
