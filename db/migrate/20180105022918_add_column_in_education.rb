class AddColumnInEducation < ActiveRecord::Migration[5.1]
  def change
    add_column :educations, :degree_level, :string
  end
end