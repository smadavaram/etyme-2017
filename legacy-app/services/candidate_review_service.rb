# frozen_string_literal: true

class CandidateReviewService
  def initialize(author)
    @author = author
  end

  def create_review(candidate_company, review_params)
    Rating::Rating.transaction do
      avg_rate = average_rate(review_params)
      metadata = { description: review_params[:description] }
      main_review = @author.rate(candidate_company, avg_rate, metadata: metadata)

      RatingCategory.all.each do |rating_category|
        rate = review_params["rate_category_#{rating_category.id}"]
        @author.rate(candidate_company, rate, scope: rating_category, metadata: { parent_id: main_review }) if rate.present?
      end
    end
    { success: true, message: 'Your review has been saved!' }
  rescue => e
    { success: false, error: e.message }
  end

  private

  def average_rate(review_params)
    all_rates = RatingCategory.all.map { |rc| review_params["rate_category_#{rc.id}"].to_f }
    return 3 if all_rates.empty?

    round_to_half(all_rates.sum / all_rates.size)
  end

  def round_to_half(number)
    (number * 2.0).round / 2.0
  end
end
