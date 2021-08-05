# frozen_string_literal: true

class Static::Candidates::ReviewsController < ApplicationController
  def create
    Rating::Rating.transaction do
      main_review = author.rate(candidate_company, average_rate, metadata: review_metadata)
      RatingCategory.all.each do |rating_category|
        rate = rate_for_category(rating_category)
        author.rate(candidate_company, rate, scope: rating_category, metadata: { parent_id: main_review }) if rate.present?
      end
    end
    flash[:success] = 'Your review has been saved!'
    redirect_back fallback_location: root_path
  end

  private

  def average_rate
    all_rates = RatingCategory.all.map { |rating_category| rate_for_category(rating_category).to_f }
    return 3 if all_rates.empty? # If no rates, it returns 3 to not afect the general average

    round_to_half(all_rates.sum / all_rates.size)
  end

  def round_to_half(number)
    (number * 2.0).round / 2.0
  end

  def rate_for_category(rating_category)
    reviews_params["rate_category_#{rating_category.id}"]
  end

  def review_metadata
    {
      description: reviews_params[:description],
    }
  end

  def candidate_company
    @candidate_company = current_company.candidates_companies.includes(:candidate).find_by(candidate_id: params[:candidate_id])
  end

  def author
    @author ||= current_user || current_candidate
  end

  def reviews_params
    params.require(:review).permit!
  end
end
