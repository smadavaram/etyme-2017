class AddBlogTypeToJobs < ActiveRecord::Migration[5.2]
  def change
    add_column :jobs, :blog_type, :integer
  end
end
