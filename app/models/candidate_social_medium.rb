class CandidateSocialMedium < ApplicationRecord
  belongs_to :candidate
  validates :social_media_name, presence: true
end
