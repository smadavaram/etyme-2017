class AddTitleToClientReference < ActiveRecord::Migration[5.2]
  def change
    add_column :client_references, :recruiter_title, :string
  end
end
