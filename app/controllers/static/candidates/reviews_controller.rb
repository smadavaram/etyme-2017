# frozen_string_literal: true

class Static::Candidates::ReviewsController < ApplicationController
  def create
    Rating::Rating.transaction do
      begin
        main_review = author.rate(candidate_company, reviews_params[:rate_general].to_i, metadata: review_metadata)
        RatingCategory.all.each do |rating_category|
          rate = rate_for_category(rating_category)
          author.rate(candidate_company, rate, scope: rating_category, metadata: { parent_id: main_review }) if rate.present?
        end
      rescue
        flash[:errors] = 'Review cannot be saved.'
      end
    end
    flash[:success] = 'Your review has been saved!'
    redirect_back fallback_location: root_path
  end

  private

  def rate_for_category(rating_category)
    reviews_params["rate_category_#{rating_category.id}"]
  end

  def review_metadata
    {
      description: reviews_params[:description],
      # TODO: Implement project_id
      # project_id: project.id
    }
  end

  def candidate_company
    @candidate_company = current_company.candidates_companies.includes(:candidate).find_by(candidate_id: params[:candidate_id])
  end

  def author
    @author ||= current_user || current_candidate
  end

  # def project
  #   @project ||= current_company.projects.find(reviews_params[:project_id])
  # end

  def reviews_params
    params.require(:review).permit!
  end
end
