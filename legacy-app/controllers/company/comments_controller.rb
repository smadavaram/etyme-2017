# frozen_string_literal: true

class Company::CommentsController < Company::BaseController
  def create
    @comment = current_user.comments.new(comments_params)
    if @comment.save
      flash[:success] = ''
    else
      flash.now[:errors] = @comment.errors.full_messages
    end
    redirect_back fallback_location: root_path
  end

  private

  def comments_params
    params.require(:comment).permit(:body, :commentable_id, :commentable_type)
  end
end
