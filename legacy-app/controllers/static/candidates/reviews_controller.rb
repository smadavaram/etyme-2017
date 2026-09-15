# frozen_string_literal: true

class Static::Candidates::ReviewsController < ApplicationController
  def create
    service = CandidateReviewService.new(author)
    result = service.create_review(candidate_company, reviews_params)
    if result[:success]
      flash[:success] = result[:message]
    else
      flash[:errors] = [result[:error]]
    end
    redirect_back fallback_location: root_path
  end

  private

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
