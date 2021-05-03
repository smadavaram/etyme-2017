class CandidateReview < ApplicationRecord

  def total_rating
    rating = (self.communication_rating + self.service_rating + self.recommend_rating ) / 3
    rating.round
  end
    
end