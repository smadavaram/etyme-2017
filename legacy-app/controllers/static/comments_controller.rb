# frozen_string_literal: true

class Static::CommentsController < ApplicationController
  def post_comment
    if current_user.present?
      @comment = current_user.comments.new(comments_params)

      if @comment.save
        flash[:success] = 'Your comment has been posted!'
      else
        flash.now[:errors] = @comment.errors.full_messages
      end
    elsif current_candidate.present?
      @comment = current_candidate.comments.new(comments_params)

      if @comment.save
        flash[:success] = 'Your comment has been posted!'
      else
        flash.now[:errors] = @comment.errors.full_messages
      end
    else
      flash.now[:errors] = 'You must be logged in to comment!'
    end

    redirect_back fallback_location: root_path
  end

  private

  def comments_params
    params.require(:comment).permit(:body, :commentable_id, :commentable_type)
  end
end
